import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export function toClientError(error, fallbackMessage) {
  const details = error?.details;
  const messageFromCode = error?.message;

  if (typeof details === "string" && details.trim()) {
    return new Error(details);
  }

  if (typeof messageFromCode === "string" && messageFromCode.trim()) {
    return new Error(messageFromCode);
  }

  return new Error(fallbackMessage);
}

export async function callFunction(name, payload, fallbackMessage = "Request failed.") {
  try {
    const fn = httpsCallable(functions, name);
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    throw toClientError(error, fallbackMessage);
  }
}
