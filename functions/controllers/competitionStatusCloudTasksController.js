import { CloudTasksClient } from "@google-cloud/tasks";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { admin, db } from "../config/firebaseAdmin.js";
import { getParticipantRemovalDrawBlock } from "../services/ticketAdjustmentAudit.js";

const REGION = "us-central1";
const QUEUE_NAME = "competition-draw-queue";
const COMPETITION_COLLECTION = "competition";
const DRAW_TASK_FIELD = "draw_task_id";
const TERMINAL_STATUSES = new Set(["cancelled", "deleted", "paused", "end", "completed"]);
const PRE_DRAW_STATUSES = new Set(["active", "sold_out", "ready_to_draw"]);

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

function isPreDrawStatus(status) {
  return PRE_DRAW_STATUSES.has(normalizeStatus(status));
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

function isSchedulableStatus(status) {
  return isPreDrawStatus(status);
}

function hasProtectedDrawState(data) {
  return (
    Boolean(data?.winner_ref) ||
    Boolean(data?.winner_ticket_ref) ||
    Boolean(data?.draw_started_at)
  );
}

function getTaskDrawMillis(taskId) {
  if (typeof taskId !== "string" || !taskId) return null;

  const lastSegment = taskId.split("-").pop();
  if (!/^\d+$/.test(lastSegment)) return null;

  const millis = Number(lastSegment);
  return Number.isSafeInteger(millis) ? millis : null;
}

function isTaskAlreadyExistsError(error) {
  const code = error?.code ?? error?.details?.code;
  return (
    code === 6 ||
    code === 409 ||
    code === "ALREADY_EXISTS" ||
    code === "already-exists"
  );
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

async function clearTaskId(competitionRef) {
  await competitionRef.update({
    [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Transactionally persists a newly created task ID only when the authoritative
 * competition document still points at the same draw date and does not already
 * reference a newer task. Never overwrites a newer/unknown task reference.
 */
async function persistAuthoritativeTaskId({
  db,
  admin,
  competitionId,
  drawDate,
  taskId,
  now,
}) {
  const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

  return db.runTransaction(async (transaction) => {
    const competitionSnap = await transaction.get(competitionRef);
    if (!competitionSnap.exists) {
      return { persisted: false, reason: "missing" };
    }

    const competitionData = competitionSnap.data() || {};
    const currentStatus = normalizeStatus(competitionData.status);

    if (!isSchedulableStatus(currentStatus)) {
      return { persisted: false, reason: "not_schedulable" };
    }
    if (hasProtectedDrawState(competitionData)) {
      return { persisted: false, reason: "protected" };
    }

    const currentDrawDate = getDateFromFirestoreValue(competitionData.draw_date);
    if (!currentDrawDate || currentDrawDate.getTime() <= now) {
      return { persisted: false, reason: "not_future" };
    }
    if (currentDrawDate.getTime() !== drawDate.getTime()) {
      return { persisted: false, reason: "draw_date_changed" };
    }

    const storedTaskId = competitionData?.[DRAW_TASK_FIELD] || null;
    if (storedTaskId === taskId) {
      return { persisted: true, alreadyStored: true, replacedTaskId: null };
    }

    if (storedTaskId) {
      const storedTaskMillis = getTaskDrawMillis(storedTaskId);
      // Never overwrite an unknown or newer task reference. Only an older task
      // associated with a superseded draw date may be replaced.
      if (storedTaskMillis === null || storedTaskMillis >= drawDate.getTime()) {
        return {
          persisted: false,
          reason: "newer_or_unknown_task_present",
          storedTaskId,
        };
      }
    }

    transaction.update(competitionRef, {
      [DRAW_TASK_FIELD]: taskId,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      persisted: true,
      alreadyStored: false,
      replacedTaskId: storedTaskId || null,
    };
  });
}

/**
 * Schedules (or confirms) the draw task for the current authoritative draw
 * date. The trigger snapshot is only used to detect staleness; all scheduling
 * and persistence decisions come from a fresh Firestore read plus a
 * transactional compare-and-set. Cloud Tasks calls stay outside transactions.
 *
 * Note: Cloud Tasks and Firestore cannot be updated atomically. A task created
 * but not persisted is intentionally left in place. The worker only accepts a
 * dispatched task whose ID exactly matches the authoritative `draw_task_id`, so
 * an orphan cannot progress the competition. Deleting an orphan would risk
 * deleting a task that becomes authoritative concurrently, so no external
 * deletion is attempted here.
 */
export async function scheduleCompetitionDrawTaskFromAuthoritativeState({
  db,
  admin,
  competitionId,
  eventDrawDate = null,
  now = Date.now(),
  createTask = createDrawTask,
  logger = console,
}) {
  const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

  const competitionSnap = await competitionRef.get();
  if (!competitionSnap.exists) {
    return { outcome: "missing" };
  }

  const competitionData = competitionSnap.data() || {};
  const currentStatus = normalizeStatus(competitionData.status);

  if (!isSchedulableStatus(currentStatus)) {
    return { outcome: "not_schedulable", status: currentStatus };
  }
  if (hasProtectedDrawState(competitionData)) {
    return { outcome: "protected", status: currentStatus };
  }

  const authoritativeDrawDate = getDateFromFirestoreValue(competitionData.draw_date);
  if (!authoritativeDrawDate || authoritativeDrawDate.getTime() <= now) {
    return { outcome: "not_future" };
  }

  if (
    eventDrawDate &&
    eventDrawDate.getTime() !== authoritativeDrawDate.getTime()
  ) {
    return {
      outcome: "stale_event",
      authoritativeDrawDate: authoritativeDrawDate.getTime(),
    };
  }

  const expectedTaskId = getTaskId(competitionId, authoritativeDrawDate);
  const storedTaskId = competitionData?.[DRAW_TASK_FIELD] || null;
  if (storedTaskId === expectedTaskId) {
    return { outcome: "already_scheduled", taskId: expectedTaskId };
  }

  let taskId = expectedTaskId;
  try {
    taskId = await createTask(competitionId, authoritativeDrawDate);
  } catch (error) {
    if (!isTaskAlreadyExistsError(error)) throw error;
    // Deterministic task names make an existing task equivalent to success.
    taskId = expectedTaskId;
  }

  // A task created here is never deleted on persistence failure. It may become
  // authoritative concurrently, and the worker's exact-ID check prevents an
  // orphan from progressing the competition.
  const persistResult = await persistAuthoritativeTaskId({
    db,
    admin,
    competitionId,
    drawDate: authoritativeDrawDate,
    taskId,
    now,
  });

  if (!persistResult.persisted) {
    logger?.warn?.(
      `[competition-status] Draw task ${taskId} was not persisted for competition ${competitionId}: ${persistResult.reason}. The task is retained as an orphan.`,
    );
    return {
      outcome: "persist_rejected",
      reason: persistResult.reason,
      taskId,
    };
  }

  // Superseded tasks are intentionally retained. The stored pointer is the only
  // authority; the old task cannot progress the competition after replacement.
  return {
    outcome: persistResult.alreadyStored ? "already_scheduled" : "scheduled",
    taskId,
    replacedTaskId: persistResult.replacedTaskId || null,
  };
}

async function scheduleCompetitionDrawTask(
  competitionRef,
  competitionId,
  drawDate,
  context = {},
) {
  return scheduleCompetitionDrawTaskFromAuthoritativeState({
    db: context.db || db,
    admin: context.admin || admin,
    competitionId,
    eventDrawDate: drawDate,
    now: typeof context.now === "function" ? context.now() : context.now,
    createTask: context.createTask || createDrawTask,
    logger: context.logger || console,
  });
}

/**
 * Reverts a future-dated ready_to_draw competition to active. The current
 * competition document is authoritative: the transition only runs while it is
 * still safe to do so, and never regresses a protected/due state. Cloud Tasks
 * operations remain outside this transaction.
 */
export async function reactivateFutureReadyToDrawCompetition({
  db,
  admin,
  competitionId,
  now = Date.now(),
}) {
  const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

  return db.runTransaction(async (transaction) => {
    const competitionSnap = await transaction.get(competitionRef);
    if (!competitionSnap.exists) {
      return { outcome: "missing" };
    }

    const competitionData = competitionSnap.data() || {};
    const currentStatus = normalizeStatus(competitionData.status);

    if (isTerminalStatus(currentStatus) || currentStatus !== "ready_to_draw") {
      return { outcome: "protected_or_not_ready", status: currentStatus };
    }

    if (
      competitionData.winner_ref ||
      competitionData.winner_ticket_ref ||
      competitionData.draw_started_at
    ) {
      return { outcome: "protected", status: currentStatus };
    }

    const drawDate = getDateFromFirestoreValue(competitionData.draw_date);
    if (!drawDate || drawDate.getTime() <= now) {
      return { outcome: "not_future", status: currentStatus };
    }

    transaction.update(competitionRef, {
      status: "active",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { outcome: "reactivated", status: "active" };
  });
}

export async function reconcileDueCompetitionDrawState({
  db,
  admin,
  competitionId,
  now = Date.now(),
}) {
  const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

  return db.runTransaction(async (transaction) => {
    const competitionSnap = await transaction.get(competitionRef);
    if (!competitionSnap.exists) {
      return { outcome: "missing", taskIds: [] };
    }

    const competitionData = competitionSnap.data() || {};
    const currentStatus = normalizeStatus(competitionData.status);
    const drawDate = getDateFromFirestoreValue(competitionData.draw_date);
    const currentTaskId = competitionData?.[DRAW_TASK_FIELD] || null;
    const nowTimestamp = admin.firestore.FieldValue.serverTimestamp();

    if (isTerminalStatus(currentStatus)) {
      if (currentTaskId) {
        transaction.update(competitionRef, {
          updated_at: nowTimestamp,
          [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
        });
      }
      return { outcome: "terminal", taskIds: currentTaskId ? [currentTaskId] : [] };
    }

    if (!drawDate || drawDate.getTime() > now) {
      return { outcome: "stale", taskIds: [] };
    }

    if (!isPreDrawStatus(currentStatus)) {
      if (currentTaskId) {
        transaction.update(competitionRef, {
          updated_at: nowTimestamp,
          [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
        });
      }
      return {
        outcome: "not_pre_draw",
        taskIds: currentTaskId ? [currentTaskId] : [],
      };
    }

    const removalBlock = await getParticipantRemovalDrawBlock({
      db,
      competitionId,
      competitionData,
      readQuery: (query) => transaction.get(query),
    });
    if (removalBlock) {
      return { outcome: "blocked", reason: removalBlock, taskIds: [] };
    }

    if (currentStatus === "ready_to_draw") {
      // Already in the target state. Only clear a stale task reference; a
      // no-op must not write, otherwise every write re-triggers this lifecycle.
      if (!currentTaskId) {
        return { outcome: "already_ready", taskIds: [] };
      }

      transaction.update(competitionRef, {
        updated_at: nowTimestamp,
        [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
      });
      return { outcome: "already_ready", taskIds: [currentTaskId] };
    }

    transaction.update(competitionRef, {
      status: "ready_to_draw",
      updated_at: nowTimestamp,
      [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
    });
    return {
      outcome: "ready_to_draw",
      taskIds: currentTaskId ? [currentTaskId] : [],
    };
  });
}

export function createCompetitionLifecycleReconciler({
  db,
  admin,
  now = () => Date.now(),
  createTask = createDrawTask,
  deleteTask = deleteTaskById,
  scheduleDrawTask = scheduleCompetitionDrawTask,
  reconcileDueDrawState = reconcileDueCompetitionDrawState,
  reactivateReadyToDraw = reactivateFutureReadyToDrawCompetition,
  logger = console,
}) {
  return async function reconcileCompetitionLifecycle({
    competitionRef,
    competitionId,
    beforeData,
    afterData,
  }) {
    if (!afterData) {
      return;
    }

    const afterStatus = normalizeStatus(afterData?.status);
    const beforeDrawDate = getDateFromFirestoreValue(beforeData?.draw_date);
    const afterDrawDate = getDateFromFirestoreValue(afterData?.draw_date);
    const beforeTaskId = beforeData?.[DRAW_TASK_FIELD] || null;
    const afterTaskId = afterData?.[DRAW_TASK_FIELD] || null;
    const taskIdChanged = beforeTaskId !== afterTaskId;
    const drawDateChanged =
      (beforeDrawDate?.getTime() || null) !== (afterDrawDate?.getTime() || null);
    const currentNow = typeof now === "function" ? now() : now;

    if (isTerminalStatus(afterStatus)) {
      await deleteTask(afterTaskId || beforeTaskId);

      if (afterTaskId) {
        await clearTaskId(competitionRef);
      }

      return;
    }

    if (!afterDrawDate) {
      if (afterTaskId) {
        await deleteTask(afterTaskId);
        await clearTaskId(competitionRef);
      }

      return;
    }

    if (!drawDateChanged && afterTaskId && taskIdChanged) {
      return;
    }

    if (afterDrawDate.getTime() <= currentNow) {
      const dueResult = await reconcileDueDrawState({
        db,
        admin,
        competitionId,
        now: currentNow,
      });

      if (dueResult.outcome === "blocked") {
        logger?.warn?.(
          `[competition-status] Draw progression blocked for competition ${competitionId}: ${dueResult.reason}`,
        );
        return;
      }

      if (dueResult.outcome === "missing" || dueResult.outcome === "stale") {
        return;
      }

      const taskIds = new Set(
        [...(dueResult.taskIds || []), afterTaskId, beforeTaskId].filter(Boolean),
      );
      for (const taskId of taskIds) {
        await deleteTask(taskId);
      }

      return;
    }

    if (afterStatus === "ready_to_draw" && isFutureDrawDate(afterDrawDate)) {
      // Re-read the authoritative document inside the transition transaction so
      // a delayed event cannot regress a newer protected state.
      await reactivateReadyToDraw({
        db,
        admin,
        competitionId,
        now: currentNow,
      });
    }

    // The trigger snapshot is only a staleness hint. Scheduling and task-ID
    // persistence are re-derived from the authoritative document so a delayed
    // event cannot schedule or store a task for a superseded draw date.
    await scheduleDrawTask(competitionRef, competitionId, afterDrawDate, {
      db,
      admin,
      now: currentNow,
      createTask,
      deleteTask,
      logger,
    });
  };
}

const reconcileCompetitionLifecycle = createCompetitionLifecycleReconciler({
  db,
  admin,
});

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

export async function transitionCompetitionToReadyToDraw({
  db,
  admin,
  competitionId,
  dispatchedTaskId = null,
  now = Date.now(),
  logger = console,
}) {
  const competitionRef = db.collection(COMPETITION_COLLECTION).doc(competitionId);

  return db.runTransaction(async (transaction) => {
    const competitionSnap = await transaction.get(competitionRef);

    if (!competitionSnap.exists) {
      return { outcome: "competition_missing" };
    }

    const competitionData = competitionSnap.data() || {};
    const currentStatus = normalizeStatus(competitionData.status);
    const drawDate = getDateFromFirestoreValue(competitionData.draw_date);
    const storedTaskId = competitionData?.[DRAW_TASK_FIELD] || null;

    if (isTerminalStatus(currentStatus)) {
      return { outcome: "terminal" };
    }

    // Only the task currently stored on the competition may progress it. An
    // orphan task (no pointer, removed pointer, or a different pointer) must
    // never advance the draw merely because the draw date is due.
    if (!dispatchedTaskId || !storedTaskId || storedTaskId !== dispatchedTaskId) {
      return { outcome: "stale_task" };
    }

    if (!drawDate || drawDate.getTime() > now) {
      return { outcome: "not_due" };
    }

    if (!isPreDrawStatus(currentStatus)) {
      if (storedTaskId) {
        transaction.update(competitionRef, {
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
        });
      }
      return { outcome: "not_pre_draw" };
    }

    const removalBlock = await getParticipantRemovalDrawBlock({
      db,
      competitionId,
      competitionData,
      readQuery: (query) => transaction.get(query),
    });
    if (removalBlock) {
      logger?.warn?.(
        `[drawWorker] Draw progression blocked for competition ${competitionId}: ${removalBlock}`,
      );
      return { outcome: "blocked", reason: removalBlock };
    }

    if (currentStatus === "ready_to_draw") {
      // Idempotent: only clear a stale task reference when one exists.
      if (storedTaskId) {
        transaction.update(competitionRef, {
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
        });
      }
      return { outcome: "already_ready" };
    }

    transaction.update(competitionRef, {
      status: "ready_to_draw",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      [DRAW_TASK_FIELD]: admin.firestore.FieldValue.delete(),
    });
    return { outcome: "ready_to_draw" };
  });
}

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

    const result = await transitionCompetitionToReadyToDraw({
      db,
      admin,
      competitionId,
      dispatchedTaskId,
    });

    if (result.outcome === "blocked") {
      throw new Error(result.reason);
    }
  },
);
