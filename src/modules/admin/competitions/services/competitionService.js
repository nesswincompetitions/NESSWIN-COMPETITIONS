import { Timestamp } from "firebase/firestore";
import { callFunction } from "@/shared/services/functionClient";
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
    const competitionImages = await uploadImages(formData.images || [], "competitions");
    const drawDateTimestamp = toTimestampFromDateAndTime(formData.drawEndDate, formData.drawEndTime);

    let questions;
    if (Array.isArray(formData.questions)) {
      const validQuestions = formData.questions.filter(
        (question) => String(question?.questionText || "").trim().length > 0,
      );

      questions = [];
      for (const question of validQuestions) {
        const questionImageUrls = await uploadImages(question.questionImages || [], "questions");
        const questionPayload = buildQuestionPayload(question, questionImageUrls);
        questions.push(
          question.id ? { ...questionPayload, id: question.id } : questionPayload
        );
      }
    }

    const saved = await callFunction(
      "saveAdminCompetition",
      {
        competitionId: id || null,
        isDraft,
        notifyOnPublish: true,
        fields: {
          title: String(formData.title || "").trim(),
          description: String(formData.description || "").trim(),
          category: String(formData.category || "").trim(),
          tag: String(formData.tag || "").trim(),
          prize_name: String(formData.prizeName || "").trim(),
          instagram_live_url: String(formData.instagramLiveLink || "").trim(),
          ticket_price: Number(formData.ticketPrice) || 0,
          prize_value: Number(formData.prizeValue) || 0,
          total_tickets: Math.max(0, Number.parseInt(formData.maxTickets, 10) || 0),
          included_things: sanitizeIncludedThings(formData.includedThings),
          is_featured: Boolean(formData.isFeatured),
          image: competitionImages,
        },
        ...(questions !== undefined
          ? { questions, replaceQuestions: true }
          : {}),
        draw_date_millis: drawDateTimestamp ? drawDateTimestamp.toMillis() : null,
      },
      "Failed to save competition."
    );

    toast.success(isDraft ? "Draft saved successfully!" : "Competition created successfully!", {
      id: loadingToast,
    });

    return { success: true, competitionId: saved.competitionId };
  } catch (error) {
    console.error("Error while creating competition:", error);
    toast.error(error?.message || "Failed to create competition.", { id: loadingToast });
    throw error;
  }
};

export const deleteCompetitionWithQuestions = async (competitionId) =>
  callFunction(
    "deleteAdminCompetition",
    { competitionId, deleteQuestions: true },
    "Failed to delete competition."
  );
