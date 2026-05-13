import { CloudTasksClient } from "@google-cloud/tasks";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { admin, db } from "../config/firebaseAdmin.js";

const REGION = "us-central1";
const QUEUE_NAME = "competition-draw-queue";
const COMPETITION_COLLECTION = "competition";
const DRAW_TASK_FIELD = "draw_task_id";
const TERMINAL_STATUSES = new Set(["cancelled", "deleted", "paused", "end", "completed"]);

const tasksClient = new CloudTasksClient();
let cachedTaskServiceAccountEmail;

function getProjectId() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || admin.app().options.projectId;

  if (!projectId) {
    throw new Error("Unable to resolve the Firebase project id for competition draw tasks.");
  }

  return projectId;
}

function getQueuePath() {
  return `projects/${getProjectId()}/locations/${REGION}/queues/${QUEUE_NAME}`;
}

function getTaskPath(taskId) {
  return `${getQueuePath()}/tasks/${taskId}`;
}

function getDrawWorkerUrl() {
  const projectId = getProjectId();
  return `https://${REGION}-${projectId}.cloudfunctions.net/drawWorker`;
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

function getDateFromFirestoreValue(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureDrawDate(drawDate) {
  return drawDate instanceof Date && drawDate.getTime() > Date.now();
}

function getTaskId(competitionId, drawDate) {
  const safeCompetitionId = String(competitionId || "competition").replace(/[^A-Za-z0-9_-]/g, "_");
  return `draw-${safeCompetitionId}-${drawDate.getTime()}`;
}

function encodeTaskBody(payload) {
  return Buffer.from(JSON.stringify({ data: payload })).toString("base64");
}

async function getTaskServiceAccountEmail() {
  if (cachedTaskServiceAccountEmail) {
    return cachedTaskServiceAccountEmail;
  }

  const explicitCredential = admin.app().options.credential;

  if (explicitCredential && typeof explicitCredential.getServiceAccountEmail === "function") {
    try {
      const accountEmail = await explicitCredential.getServiceAccountEmail();
      if (accountEmail) {
        cachedTaskServiceAccountEmail = accountEmail;
        return accountEmail;
      }
    } catch (error) {
      console.warn("[competition-status] Unable to resolve service account from ADC:", error);
    }
  }

  cachedTaskServiceAccountEmail = `${getProjectId()}@appspot.gserviceaccount.com`;
  return cachedTaskServiceAccountEmail;
}

async function deleteTaskById(taskId) {
  if (!taskId) return;

  try {
    await tasksClient.deleteTask({ name: getTaskPath(taskId) });
  } catch (error) {
    const code = error?.code || error?.details?.code;

    if (code === 5 || code === 404 || code === "NOT_FOUND") {
      return;
    }

    throw error;
  }
}

async function createDrawTask(competitionId, drawDate) {
  const taskId = getTaskId(competitionId, drawDate);
  const taskName = getTaskPath(taskId);
  const scheduleTime = {
    seconds: Math.floor(drawDate.getTime() / 1000),
    nanos: (drawDate.getTime() % 1000) * 1_000_000,
  };

  const [createdTask] = await tasksClient.createTask({
    parent: getQueuePath(),
    task: {
      name: taskName,
      scheduleTime,
      httpRequest: {
        httpMethod: "POST",
        url: getDrawWorkerUrl(),
        headers: {
          "Content-Type": "application/json",
        },
        oidcToken: {
          serviceAccountEmail: await getTaskServiceAccountEmail(),
        },
        body: encodeTaskBody({
          competitionId,
          taskId,
        }),
      },
    },
  });

  return createdTask?.name?.split("/").pop() || taskId;
}

async function storeTaskId(competitionRef, taskId) {
  await competitionRef.set(
    {
      [DRAW_TASK_FIELD]: taskId,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function clearTaskId(competitionRef) {
  await competitionRef.update({
    [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteTaskRecord(competitionRef, taskId, shouldClearField = false) {
  await deleteTaskById(taskId);

  if (shouldClearField && taskId) {
    await clearTaskId(competitionRef);
  }
}

async function scheduleCompetitionDrawTask(competitionRef, competitionId, drawDate) {
  const taskId = await createDrawTask(competitionId, drawDate);
  await storeTaskId(competitionRef, taskId);
}

async function markCompetitionReadyToDraw(competitionRef) {
  await competitionRef.set(
    {
      status: "ready_to_draw",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function markCompetitionActive(competitionRef) {
  await competitionRef.set(
    {
      status: "active",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function reconcileCompetitionLifecycle({ competitionRef, competitionId, beforeData, afterData }) {
  const afterStatus = normalizeStatus(afterData?.status);
  const beforeDrawDate = getDateFromFirestoreValue(beforeData?.draw_date);
  const afterDrawDate = getDateFromFirestoreValue(afterData?.draw_date);
  const beforeTaskId = beforeData?.[DRAW_TASK_FIELD] || null;
  const afterTaskId = afterData?.[DRAW_TASK_FIELD] || null;
  const taskIdChanged = beforeTaskId !== afterTaskId;
  const drawDateChanged = (beforeDrawDate?.getTime() || null) !== (afterDrawDate?.getTime() || null);
  const now = Date.now();

  if (!afterData) {
    return;
  }

  if (isTerminalStatus(afterStatus)) {
    await deleteTaskById(afterTaskId || beforeTaskId);

    if (afterTaskId) {
      await clearTaskId(competitionRef);
    }

    return;
  }

  if (!afterDrawDate) {
    if (afterTaskId) {
      await deleteTaskRecord(competitionRef, afterTaskId, true);
    }

    return;
  }

  if (!drawDateChanged && afterTaskId && taskIdChanged) {
    return;
  }

  if (afterDrawDate.getTime() <= now) {
    if (afterTaskId || beforeTaskId) {
      await deleteTaskById(afterTaskId || beforeTaskId);
    }

    if (afterStatus !== "ready_to_draw") {
      await markCompetitionReadyToDraw(competitionRef);
    }

    if (afterTaskId) {
      await clearTaskId(competitionRef);
    }

    return;
  }

  if (afterStatus === "ready_to_draw" && isFutureDrawDate(afterDrawDate)) {
    await markCompetitionActive(competitionRef);
  }

  const currentTaskId = afterTaskId || beforeTaskId;

  if (drawDateChanged || !currentTaskId) {
    if (beforeTaskId && beforeTaskId !== afterTaskId) {
      await deleteTaskById(beforeTaskId);
    }

    await scheduleCompetitionDrawTask(competitionRef, competitionId, afterDrawDate);
  }
}

export const scheduleCompetitionDrawOnCreate = onDocumentCreated(
  {
    document: `${COMPETITION_COLLECTION}/{competitionId}`,
    region: REGION,
  },
  async (event) => {
    const competitionId = event.params.competitionId;
    const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);
    const competitionData = event.data?.data() || {};

    await reconcileCompetitionLifecycle({
      competitionRef,
      competitionId,
      beforeData: null,
      afterData: competitionData,
    });
  },
);

export const scheduleCompetitionDrawOnUpdate = onDocumentUpdated(
  {
    document: `${COMPETITION_COLLECTION}/{competitionId}`,
    region: REGION,
  },
  async (event) => {
    const competitionId = event.params.competitionId;
    const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;

    await reconcileCompetitionLifecycle({
      competitionRef,
      competitionId,
      beforeData,
      afterData,
    });
  },
);

export const cancelCompetitionDrawOnDelete = onDocumentDeleted(
  {
    document: `${COMPETITION_COLLECTION}/{competitionId}`,
    region: REGION,
  },
  async (event) => {
    const beforeData = event.data?.data() || {};
    await deleteTaskById(beforeData?.[DRAW_TASK_FIELD]);
  },
);

export const drawWorker = onTaskDispatched(
  {
    region: REGION,
    retry: true,
    rateLimits: {
      maxConcurrentDispatches: 1,
    },
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 10,
      maxBackoffSeconds: 600,
    },
  },
  async (request) => {
    const competitionId = request.data?.competitionId;
    const dispatchedTaskId = request.context?.id || request.data?.taskId || null;

    if (!competitionId) {
      throw new Error("competitionId is required for drawWorker tasks.");
    }

    const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

    await db.runTransaction(async (transaction) => {
      const competitionSnap = await transaction.get(competitionRef);

      if (!competitionSnap.exists) {
        return;
      }

      const competitionData = competitionSnap.data() || {};
      const currentStatus = normalizeStatus(competitionData.status);
      const drawDate = getDateFromFirestoreValue(competitionData.draw_date);
      const storedTaskId = competitionData?.[DRAW_TASK_FIELD] || null;

      if (isTerminalStatus(currentStatus)) {
        return;
      }

      if (storedTaskId && dispatchedTaskId && storedTaskId !== dispatchedTaskId) {
        return;
      }

      if (!drawDate || drawDate.getTime() > Date.now()) {
        return;
      }

      if (currentStatus === "ready_to_draw") {
        transaction.set(
          competitionRef,
          {
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
          },
          { merge: true },
        );
        return;
      }

      transaction.set(
        competitionRef,
        {
          status: "ready_to_draw",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
        },
        { merge: true },
      );
    });
  },
);