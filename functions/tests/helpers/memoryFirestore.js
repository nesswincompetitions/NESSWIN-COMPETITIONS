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
}

export class MemoryQuery {
  constructor(db, collectionName, constraints = []) {
    this.db = db;
    this.collectionName = collectionName;
    this.constraints = constraints;
  }

  where(field, operator, value) {
    return new MemoryQuery(this.db, this.collectionName, [
      ...this.constraints,
      { field, operator, value },
    ]);
  }

  async get() {
    const docs = [];
    const store = this.db.collectionStore(this.collectionName);

    store.forEach((data, id) => {
      const matches = this.constraints.every(({ field, operator, value }) => {
        if (operator !== '==') {
          throw new Error(`Unsupported query operator in test harness: ${operator}`);
        }
        return valuesEqual(data?.[field], value);
      });

      if (matches) {
        const ref = new MemoryDocRef(this.db, this.collectionName, id);
        docs.push(makeSnapshot(ref, data));
      }
    });

    return { docs };
  }
}

export class MemoryCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    return new MemoryDocRef(this.db, this.name, id);
  }

  where(field, operator, value) {
    return new MemoryQuery(this.db, this.name).where(field, operator, value);
  }
}

export class MemoryTransaction {
  constructor(db) {
    this.db = db;
    this.reads = new Map();
    this.writes = [];
  }

  async get(ref) {
    await Promise.resolve();
    const [collectionName, id] = splitPath(ref.path);
    const data = this.db.collectionStore(collectionName).get(id) ?? null;
    this.reads.set(ref.path, this.db.version(ref.path));
    const snapshot = makeSnapshot(ref, data);
    if (this.db.afterTransactionRead) {
      await this.db.afterTransactionRead(ref, this);
    }
    return snapshot;
  }

  update(ref, data) {
    this.writes.push({ type: 'update', path: ref.path, data });
  }

  set(ref, data) {
    this.writes.push({ type: 'set', path: ref.path, data });
  }
}

export class MemoryDB {
  constructor(initial = {}) {
    this.collections = new Map();
    this.versions = new Map();
    this.txCalls = 0;
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
        store.set(id, { ...existing, ...data });
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
  return {
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ __mockServerTimestamp: true }),
        increment: (value) => ({ __mockIncrement: value }),
      },
    },
  };
}

export function createMockLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
