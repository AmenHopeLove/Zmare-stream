import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('db.json');

const defaultDB = {
  profiles: [],
  playlists: [],
  analytics: []
};

const readDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading db.json:', e);
    return defaultDB;
  }
};

const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error writing db.json:', e);
  }
};

class Chainable {
  constructor(table, operation = 'select') {
    this.table = table;
    this.operation = operation;
    this.filters = [];
    this.limitVal = null;
    this.orderVal = null;
    this.isSingle = false;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  order(column, options) {
    this.orderVal = { column, ...options };
    return this;
  }

  limit(n) {
    this.limitVal = n;
    return this;
  }

  async then(resolve, reject) {
    try {
      const db = readDB();
      let data = db[this.table] || [];

      // Apply Filters
      for (const filter of this.filters) {
        data = data.filter(item => item[filter.column] === filter.value);
      }

      // Apply Order
      if (this.orderVal) {
        data.sort((a, b) => {
          const valA = a[this.orderVal.column];
          const valB = b[this.orderVal.column];
          if (this.orderVal.ascending) return valA > valB ? 1 : -1;
          return valA < valB ? 1 : -1;
        });
      }

      // Apply Limit
      if (this.limitVal) {
        data = data.slice(0, this.limitVal);
      }

      if (this.isSingle) {
        resolve({ data: data[0] || null, error: null });
      } else {
        resolve({ data, error: null });
      }
    } catch (e) {
      resolve({ data: null, error: e.message });
    }
  }
}

export const localDB = {
  from: (table) => ({
    select: (columns = '*') => new Chainable(table, 'select'),
    upsert: async (newItem) => {
      const db = readDB();
      if (!db[table]) db[table] = [];
      
      const idKey = table === 'profiles' ? 'id' : (table === 'playlists' ? 'profile_id' : 'id');
      const idx = db[table].findIndex(i => i[idKey] === newItem[idKey]);
      
      if (idx > -1) {
        db[table][idx] = { ...db[table][idx], ...newItem };
      } else {
        db[table].push(newItem);
      }
      writeDB(db);
      return { error: null };
    },
    delete: () => ({
      eq: (column, value) => ({
        async then(resolve) {
          const db = readDB();
          if (!db[table]) return resolve({ error: null });
          db[table] = db[table].filter(i => i[column] !== value);
          writeDB(db);
          resolve({ error: null });
        }
      })
    })
  })
};
