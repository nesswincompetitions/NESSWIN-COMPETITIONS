import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc,
  writeBatch,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export const fetchAdminCompetitionDetail = async (id) => {
  const compDoc = await getDoc(doc(db, 'competition', id));
  if (!compDoc.exists()) return null;
  
  const questionsQuery = query(collection(db, 'questions'), where('competition_id', '==', doc(db, 'competition', id)));
  const questionsSnap = await getDocs(questionsQuery);
  const questions = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const winnerRef = compDoc.data().winner_ref;
  const winnerTicketRef = compDoc.data().winner_ticket_ref;

  let winnerDetails = null;
  if (winnerRef || winnerTicketRef) {
    const [winnerSnap, winnerTicketSnap] = await Promise.all([
      winnerRef ? getDoc(winnerRef) : Promise.resolve(null),
      winnerTicketRef ? getDoc(winnerTicketRef) : Promise.resolve(null),
    ]);

    winnerDetails = {
      user: winnerSnap?.exists() ? { id: winnerSnap.id, ...winnerSnap.data() } : null,
      ticket: winnerTicketSnap?.exists() ? { id: winnerTicketSnap.id, ...winnerTicketSnap.data() } : null,
    };
  }

  return { 
    id: compDoc.id, 
    ...compDoc.data(),
    questions,
    winnerDetails,
  };
};

export const updateCompetition = async (id, data) => {
  const compRef = doc(db, 'competition', id);
  await updateDoc(compRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
};

export const deleteCompetition = async (id) => {
  const competitionRef = doc(db, 'competition', id);
  await updateDoc(competitionRef, {
    status: 'deleted',
    updated_at: serverTimestamp()
  });
};

export const syncCompetitionQuestions = async (competitionId, questions) => {
  const batch = questions.map(async (q) => {
    const { id, ...data } = q;
    if (id) {
      const qRef = doc(db, 'questions', id);
      await updateDoc(qRef, data);
    } else {
      await addDoc(collection(db, 'questions'), {
        ...data,
        competition_id: doc(db, 'competition', competitionId),
        created_at: serverTimestamp()
      });
    }
  });
  await Promise.all(batch);
};

export const fetchCompetitionDrafts = async () => {
  const q = query(collection(db, 'competition'), where('status', '==', 'draft'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const fetchAdminCompetitionsList = async () => {
  const q = query(
    collection(db, 'competition'), 
    where('status', '!=', 'deleted'),
    orderBy('status'), 
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    const sold = data.sold_tickets || 0;
    const total = data.total_tickets || 1000;
    const price = data.ticket_price || 0;
    const revenue = sold * price;
    const drawDate = data.draw_date 
      ? data.draw_date.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
      : '—';

    return {
      id: doc.id,
      name: data.title || 'Untitled',
      subTitle: data.sub_title || data.tag || '',
      status: data.status || 'draft',
      price: `£${price}`,
      sold,
      total,
      revenue: `£${revenue.toLocaleString()}`,
      drawDate,
      image: data.image?.[0] || null,
      createdAt: data.created_at?.toDate() || new Date(),
    };
  });
};

export const fetchCompetitionParticipants = async (competitionId, participantUids) => {
  if (!participantUids || participantUids.length === 0) return [];

  const compRef = doc(db, 'competition', competitionId);
  
  const [ticketsSnapString, ticketsSnapRef] = await Promise.all([
    getDocs(query(collection(db, 'ticket'), where('competition_id', '==', competitionId))),
    getDocs(query(collection(db, 'ticket'), where('competition_id', '==', compRef)))
  ]);
  
  const allTicketDocs = [];
  const seenTicketIds = new Set();
  [...ticketsSnapString.docs, ...ticketsSnapRef.docs].forEach(docSnap => {
    if (!seenTicketIds.has(docSnap.id)) {
      seenTicketIds.add(docSnap.id);
      allTicketDocs.push(docSnap);
    }
  });
  
  const ticketMap = {};
  allTicketDocs.forEach(docSnap => {
    const data = docSnap.data();
    const rawUid = data.user_id || data.user_ref || data.uid || data.user;
    const uid = rawUid?.id ?? (typeof rawUid === 'string' ? rawUid : null);
    
    if (uid) {
      if (!ticketMap[uid]) ticketMap[uid] = [];
      const tNum = data.ticket_sequence ?? data.ticket_number ?? data.ticket;
      if (tNum) ticketMap[uid].push(tNum);
    }
  });

  const participantsList = [];

  for (const rawUid of participantUids) {
    const uid = rawUid?.id ?? (typeof rawUid === 'string' ? rawUid : null);
    if (!uid) continue;

    const userDoc = await getDoc(doc(db, 'user', uid));
    const userData = userDoc.exists() ? userDoc.data() : { display_name: 'Unknown User', email: 'N/A', is_active: false };

    participantsList.push({
      id: uid,
      name: userData.display_name || userData.name || 'Unknown User',
      email: userData.email || 'N/A',
      phone_number: userData.phone_number || userData.phone || 'N/A',
      tickets: ticketMap[uid] || [],
      status: userData.is_active ? 'Active' : 'Inactive',
      joinedDate: userData.created_at?.toMillis ? new Date(userData.created_at.toMillis()).toLocaleDateString() : 'N/A'
    });
  }

  return participantsList;
};
