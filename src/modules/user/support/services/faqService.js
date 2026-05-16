import { collection, getDocs, doc, updateDoc, increment, query, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * Fetches all FAQs from Firestore ordered by view_count.
 */
export const fetchFaqs = async () => {
  try {
    const faqsRef = collection(db, 'faqs');
    const q = query(faqsRef, orderBy('view_count', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    return [];
  }
};

/**
 * Increments the view_count of a specific FAQ in Firestore.
 * This is non-blocking so it doesn't cause UI lag.
 * 
 * @param {string} faqId - The ID of the FAQ document
 */
export const incrementFaqViewCount = (faqId) => {
  try {
    const faqRef = doc(db, 'faqs', faqId);
    // Fire and forget, don't wait for the promise to resolve
    updateDoc(faqRef, {
      view_count: increment(1)
    }).catch(err => {
      console.error('Failed to increment FAQ view count:', err);
    });
  } catch (error) {
    console.error('Error initiating FAQ view count increment:', error);
  }
};
