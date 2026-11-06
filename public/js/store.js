// Recordings people choose to save, kept in this browser's IndexedDB. Nothing is uploaded.

const DB_NAME = 'enginie';
const STORE = 'recordings';

let opening = null;

function openDatabase() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const addRecording = (recording) => withStore('readwrite', (store) => store.add(recording));
export const listRecordings = () => withStore('readonly', (store) => store.getAll());
export const deleteRecording = (id) => withStore('readwrite', (store) => store.delete(id));
