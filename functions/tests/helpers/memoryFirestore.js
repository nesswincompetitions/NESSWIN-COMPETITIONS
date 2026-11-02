export class MockHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function splitPath(path) {
  const index = path.indexOf('/');
  return [path.slice(0, index), path.slice(index + 1)];
}

function isReference(value) {
  return value && typeof value === 'object' && typeof value.path === 'string' && typeof value.id === 'string';
}

function valuesEqual(left, right) {
  if (isReference(left) && isReference(right)) {
    return left.path === right.path;
  }
  return left === right;
}

function makeSnapshot(ref, data) {
  return {
    id: ref.id,
    ref,
    exists: data !== null && data !== undefined,
    data: () => data,
  };
}

export class MemoryDocRef {
  constructor(db, collectionName, id) {
    this.db = db;
    this.collectionName = collectionName;
    this.id = id;
    this.path = `${collectionName}/${id}`;
  }

  async get() {
    return this.db.snapshot(this.collectionName, this.id);
  }

  async update(data) {
    this.db.applyWrites([{ type: 'update', path: this.path, data }]);
  }

  async set(data) {
    this.db.applyWrites([{ type: 'set', path: this.path, data }]);
  }
}

function compareQueryValues(left, right) {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function querySnapshots(query, onRead) {
  const docs = [];
  const store = query.db.collectionStore(query.collectionName);

  store.forEach((data, id) => {
    const matches = query.constraints.every(({ field, operator, value }) => {
      if (operator !== '==') {
        throw new Error(`Unsupported query operator in test harness: ${operator}`);
      }
      return valuesEqual(data?.[field], value);
    });

    if (matches) {
      const ref = new MemoryDocRef(query.db, query.collectionName, id);
      if (onRead) onRead(ref);
      docs.push({ ref, data });
    }
  });

  if (query.orderByConstraints.length > 0) {
    docs.sort((left, right) => {
      for (const { field, direction } of query.orderByConstraints) {
        const result = compareQueryValues(left.data?.[field], right.data?.[field]);
        if (result !== 0) return direction === 'desc' ? -result : result;
      }
      return 0;
    });
  }

  let results = docs;
  if (query.cursorSnapshot) {
    const cursorPath = query.cursorSnapshot.ref?.path;
    const cursorIndex = results.findIndex(({ ref }) => ref.path === cursorPath);
    results = cursorIndex === -1 ? [] : results.slice(cursorIndex + 1);
  }

  const limited = query.limitCount === null
    ? results
    : results.slice(0, query.limitCount);

  return limited.map(({ ref, data }) => makeSnapshot(ref, data));
}

export class MemoryQuery {
  constructor(
    db,
    collectionName,
    constraints = [],
    orderByConstraints = [],
    limitCount = null,
    cursorSnapshot = null,
  ) {
    this.db = db;
    this.collectionName = collectionName;
    this.constraints = constraints;
    this.orderByConstraints = orderByConstraints;
    this.limitCount = limitCount;
    this.cursorSnapshot = cursorSnapshot;
  }

  where(field, operator, value) {
    return new MemoryQuery(
      this.db,
      this.collectionName,
      [...this.constraints, { field, operator, value }],
      this.orderByConstraints,
      this.limitCount,
      this.cursorSnapshot,
    );
  }

  orderBy(field, direction = 'asc') {
    return new MemoryQuery(
      this.db,
      this.collectionName,
      this.constraints,
      [...this.orderByConstraints, { field, direction }],
      this.limitCount,
      this.cursorSnapshot,
    );
  }

  limit(count) {
    return new MemoryQuery(
      this.db,
      this.collectionName,
      this.constraints,
      this.orderByConstraints,
      count,
      this.cursorSnapshot,
    );
  }

  startAfter(snapshot) {
    return new MemoryQuery(
      this.db,
      this.collectionName,
      this.constraints,
      this.orderByConstraints,
      this.limitCount,
      snapshot,
    );
  }

  async get() {
    const docs = querySnapshots(this);
    return { docs, empty: docs.length === 0 };
  }
}

export class MemoryCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    const resolvedId = id || `${this.name}_auto_${++this.db.autoIdCounter}`;
    return new MemoryDocRef(this.db, this.name, resolvedId);
  }

  async add(data) {
    const ref = this.doc();
    this.db.setDocument(this.name, ref.id, data);
    return ref;
  }

  where(field, operator, value) {
    return new MemoryQuery(this.db, this.name).where(field, operator, value);
  }

  orderBy(field, direction = 'asc') {
    return new MemoryQuery(this.db, this.name).orderBy(field, direction);
  }
}

export class MemoryBatch {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }

  update(ref, data) {
    this.writes.push({ type: 'update', path: ref.path, data });
    return this;
  }

  set(ref, data) {
    this.writes.push({ type: 'set', path: ref.path, data });
    return this;
  }

  delete(ref) {
    this.writes.push({ type: 'delete', path: ref.path });
    return this;
  }

  async commit() {
    this.db.applyWrites(this.writes);
  }
}

export class MemoryTransaction {
  constructor(db) {
    this.db = db;
    this.reads = new Map();
    this.writes = [];
  }

  async get(refOrQuery) {
    await Promise.resolve();
    if (refOrQuery instanceof MemoryQuery) {
      const docs = querySnapshots(refOrQuery, (ref) => {
        this.reads.set(ref.path, this.db.version(ref.path));
      });
      return { docs, empty: docs.length === 0 };
    }

    const [collectionName, id] = splitPath(refOrQuery.path);
    const data = this.db.collectionStore(collectionName).get(id) ?? null;
    this.reads.set(refOrQuery.path, this.db.version(refOrQuery.path));
    const snapshot = makeSnapshot(refOrQuery, data);
    if (this.db.afterTransactionRead) {
      await this.db.afterTransactionRead(refOrQuery, this);
    }
    return snapshot;
  }

  update(ref, data) {
    this.writes.push({ type: 'update', path: ref.path, data });
  }

  set(ref, data) {
    this.writes.push({ type: 'set', path: ref.path, data });
  }

  delete(ref) {
    this.writes.push({ type: 'delete', path: ref.path });
  }
}

function applyFieldValues(current, data) {
  const next = { ...current };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && '__mockIncrement' in value) {
      next[key] = Number(current[key] ?? 0) + value.__mockIncrement;
    } else if (value && typeof value === 'object' && '__mockArrayUnion' in value) {
      const existing = Array.isArray(current[key]) ? current[key] : [];
      const additions = value.__mockArrayUnion;
      next[key] = [
        ...existing,
        ...additions.filter(
          (addition) => !existing.some((item) => valuesEqual(item, addition)),
        ),
      ];
    } else if (value && typeof value === 'object' && '__mockDelete' in value) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }

  return next;
}

export class MemoryDB {
  constructor(initial = {}) {
    this.collections = new Map();
    this.versions = new Map();
    this.txCalls = 0;
    this.autoIdCounter = 0;
    this.beforeTransaction = null;
    this.afterTransactionRead = null;

    for (const [name, docs] of Object.entries(initial)) {
      const collection = new Map();
      for (const [id, data] of Object.entries(docs)) {
        collection.set(id, { ...data });
      }
      this.collections.set(name, collection);
    }
  }

  collectionStore(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  collection(name) {
    return new MemoryCollection(this, name);
  }

  batch() {
    return new MemoryBatch(this);
  }

  version(path) {
    return this.versions.get(path) ?? 0;
  }

  bumpVersion(path) {
    this.versions.set(path, this.version(path) + 1);
  }

  snapshot(collectionName, id) {
    const ref = new MemoryDocRef(this, collectionName, id);
    return makeSnapshot(ref, this.collectionStore(collectionName).get(id) ?? null);
  }

  setDocument(collectionName, id, data) {
    this.collectionStore(collectionName).set(id, { ...data });
    this.bumpVersion(`${collectionName}/${id}`);
  }

  applyWrites(writes) {
    writes.forEach(({ type, path, data }) => {
      const [collectionName, id] = splitPath(path);
      const store = this.collectionStore(collectionName);
      if (type === 'update') {
        const existing = store.get(id);
        if (existing === undefined) {
          throw new Error(`Cannot update missing document ${path}`);
        }
        store.set(id, applyFieldValues(existing, data));
      } else if (type === 'delete') {
        store.delete(id);
      } else {
        store.set(id, { ...data });
      }
      this.bumpVersion(path);
    });
  }

  async runTransaction(fn) {
    const callIndex = ++this.txCalls;

    if (this.beforeTransaction) {
      const hook = this.beforeTransaction;
      this.beforeTransaction = null;
      await hook(callIndex);
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const transaction = new MemoryTransaction(this);
      const result = await fn(transaction);

      const conflicted = [...transaction.reads].some(
        ([path, version]) => this.version(path) !== version
      );

      if (!conflicted) {
        this.applyWrites(transaction.writes);
        return result;
      }
    }

    throw new Error('Transaction retry limit exceeded in test harness.');
  }
}

export function createMockAdmin() {
  const deletedAuthUsers = [];
  return {
    deletedAuthUsers,
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ __mockServerTimestamp: true }),
        increment: (value) => ({ __mockIncrement: value }),
        arrayUnion: (...values) => ({ __mockArrayUnion: values }),
        delete: () => ({ __mockDelete: true }),
      },
    },
    auth: () => ({
      deleteUser: async (uid) => {
        deletedAuthUsers.push(uid);
      },
    }),
  };
}

export function createMockLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
