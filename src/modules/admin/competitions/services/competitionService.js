import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { uploadImages } from "@/shared/services/storageService";
import { toast } from "react-hot-toast";

const toTimestampFromDateAndTime = (date, time) => {
  if (!date) return null;

  const value = time ? `${date}T${time}` : `${date}T00:00`;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Timestamp.fromDate(parsed);
};

const sanitizeIncludedThings = (includedThings) => {
  if (!Array.isArray(includedThings)) return [];
  return includedThings
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const buildQuestionPayload = (question, imageUrls) => {
  const timestamp = Date.now();
  const options = (question.answers || []).map((answer, index) => ({
    option_id: `opt_${timestamp}_${index}`,
    option: String(answer?.text || "").trim(),
  }));

  const correctIndex = (question.answers || []).findIndex((answer) => answer?.isCorrect);
  const safeCorrectIndex = correctIndex >= 0 ? correctIndex : 0;

  return {
    question: String(question.questionText || "").trim(),
    images: imageUrls,
    option: options,
    answer: options[safeCorrectIndex] || null,
  };
};

export const createCompetition = async ({ id, formData, isDraft = false }) => {
  const loadingToast = toast.loading(isDraft ? "Saving draft..." : "Creating competition...");

  try {
    const competitionRef = id
      ? doc(db, "competition", id)
      : doc(collection(db, "competition"));

    const existingSnap = id ? await getDoc(competitionRef) : null;
    const existingData = existingSnap?.exists() ? existingSnap.data() : null;

    const competitionImages = await uploadImages(formData.images || [], "competitions");

    const drawDateTimestamp = toTimestampFromDateAndTime(formData.drawEndDate, formData.drawEndTime);

    const competitionPayload = {
      title: String(formData.title || "").trim(),
      description: String(formData.description || "").trim(),
      category: String(formData.category || "").trim(),
      tag: String(formData.tag || "").trim(),
      prize_name: String(formData.prizeName || "").trim(),
      instagram_live_url: String(formData.instagramLiveLink || "").trim(),
      ticket_price: Number(formData.ticketPrice) || 0,
      prize_value: Number(formData.prizeValue) || 0,
      total_tickets: Math.max(0, Number.parseInt(formData.maxTickets, 10) || 0),
      draw_date: drawDateTimestamp,
      included_things: sanitizeIncludedThings(formData.includedThings),
      is_featured: Boolean(formData.isFeatured),
      image: competitionImages,

      status: isDraft ? "draft" : "active",
      stock_quantity: Math.max(0, Number.parseInt(formData.maxTickets, 10) || 0),
      sold_tickets: existingData?.sold_tickets ?? 0,
      last_ticket_sequence: existingData?.last_ticket_sequence ?? 0,
      participants: Array.isArray(existingData?.participants) ? existingData.participants : [],
      created_at: existingData?.created_at ?? serverTimestamp(),
      updated_at: serverTimestamp(),
    };

    const isTransitioningToActive = !isDraft && (!existingData || existingData.status === "draft");

    const batch = writeBatch(db);
    batch.set(competitionRef, competitionPayload);

    if (isTransitioningToActive) {
      // Broadcast notification for new competition
      const broadcastNotifRef = doc(collection(db, "ff_push_notifications"));
      batch.set(broadcastNotifRef, {
        initial_page_name: "Competitions",
        notification_text: `A new competition for ${formData.prizeName} is now live! Join now.`,
        notification_title: "New Competition Launched! 🚀",
        num_sent: 0,
        parameter_data: JSON.stringify({
          compitation: competitionRef.path,
          competition_ref: competitionRef.path,
          competitionId: competitionRef.id,
        }),
        status: "",
        target_audience: "All",
        timestamp: serverTimestamp(),
        user_refs: "",
      });
    }

    await batch.commit();

    if (Array.isArray(formData.questions)) {
      const existingQuestionsQuery = query(
        collection(db, "questions"),
        where("competition_id", "==", competitionRef),
      );
      const existingQuestionsSnap = await getDocs(existingQuestionsQuery);

      if (!existingQuestionsSnap.empty) {
        const deleteBatch = writeBatch(db);
        existingQuestionsSnap.forEach((questionDoc) => {
          deleteBatch.delete(questionDoc.ref);
        });
        await deleteBatch.commit();
      }

      const validQuestions = formData.questions.filter(
        (question) => String(question?.questionText || "").trim().length > 0,
      );

      if (validQuestions.length > 0) {
        const questionBatch = writeBatch(db);

        for (const question of validQuestions) {
          const questionImageUrls = await uploadImages(question.questionImages || [], "questions");
          const questionPayload = buildQuestionPayload(question, questionImageUrls);
          const questionRef = doc(collection(db, "questions"));

          questionBatch.set(questionRef, {
            ...questionPayload,
            competition_id: competitionRef,
            question_id: questionRef.id,
            created_at: serverTimestamp(),
          });
        }

        await questionBatch.commit();
      }
    }

    toast.success(isDraft ? "Draft saved successfully!" : "Competition created successfully!", {
      id: loadingToast,
    });

    return { success: true, competitionId: competitionRef.id };
  } catch (error) {
    console.error("Error while creating competition:", error);
    toast.error(error?.message || "Failed to create competition.", { id: loadingToast });
    throw error;
  }
};

export const deleteCompetitionWithQuestions = async (competitionId) => {
  const competitionRef = doc(db, "competition", competitionId);

  const questionsQuery = query(
    collection(db, "questions"),
    where("competition_id", "==", competitionRef),
  );

  const questionsSnap = await getDocs(questionsQuery);

  const batch = writeBatch(db);
  questionsSnap.forEach((questionDoc) => batch.delete(questionDoc.ref));
  batch.delete(competitionRef);

  await batch.commit();
};
