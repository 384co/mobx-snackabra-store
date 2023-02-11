export declare module IndexedKV { }

interface IndexedKVOptions {
  db: string,
  table: string
}

export type StructuredCloneData = Exclude<unknown, Function>

/**
 * IndexedKV is a simple wrapper around IndexedDB
 */
class IndexedKV {

  private indexedDB: IDBFactory;
  private readyResolver: Function | undefined;

  public db: IDBDatabase | undefined;
  public ready = new Promise((resolve) => {
    this.readyResolver = resolve
  })
  public options: IndexedKVOptions = {
    db: 'MyDB',
    table: 'default'
  }

  constructor(options: IndexedKVOptions | undefined) {
    this.options = Object.assign(this.options, options)
    if (!window.indexedDB) {
      throw new Error("Your browser doesn't support a stable version of IndexedDB.");
    }

    this.indexedDB = window.indexedDB;
    console.log(this.indexedDB)
    const openReq = this.indexedDB.open(this.options.db);

    openReq.onerror = event => {
      console.error("Database error: " + event);
      console.error(event);
    };

    openReq.onsuccess = () => {
      this.db = openReq.result;
      if (this.readyResolver) {
        this.readyResolver(true)
      }
    };

    openReq.onupgradeneeded = () => {
      this.db = openReq.result;
      this.db.createObjectStore(this.options.table, { keyPath: "key" });
      this.useDatabase();
    };

  }

  /**
   * Select what database to use
   */
  private useDatabase = (): void => {
    const newReq = this.indexedDB.open(this.options.db);
    newReq.onsuccess = () => {
      this.db = newReq.result;
      if (this.readyResolver) {
        this.readyResolver(true)
      }
    };
    newReq.onerror = event => {
      console.error(event);
    };

    newReq.onupgradeneeded = () => {
      this.db = newReq.result;
    };
  }
  /**
   * Similar to "Select * WHERE $regex" implementation
   * 
   * @param regex {Regular expression matcher}
   * @param callback {Function to perform (optional) }
   * @returns Promise<any>
   */
  openCursor = (regex: RegExp, callback: Function): Promise<Array<StructuredCloneData>> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {
          const transaction: IDBTransaction = this.db.transaction([this.options.table], "readonly");
          const objectStore: IDBObjectStore = transaction.objectStore(this.options.table);
          const request = objectStore.openCursor(null, 'next');
          let returnArray: Array<IDBRequest["result"]> = [];
          request.onsuccess = function () {
            const cursor = request.result;

            if (cursor) {

              if (String(cursor.key).match(regex)) {
                returnArray.push({ value: cursor.value.value, key: cursor.value.key })
              }
              cursor.continue();
            } else {
              if (callback) {
                callback(returnArray)
              }
              resolve(returnArray);
            }
          };
        } else {
          reject('DB is not defined')
        }
      });
    })
  }

  /**
   * setItem will add or replace an entry by key
   * 
   * @param key : string | number
   * @param value : A structured clone algorithm compatible data type https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
   * @returns 
   */
  setItem = (key: string | number, value: StructuredCloneData): Promise<IDBValidKey> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {
          const objectStore = this.db.transaction([this.options.table], "readwrite").objectStore(this.options.table);
          const request = objectStore.get(key);
          request.onerror = event => {
            reject(event)
          };
          request.onsuccess = () => {
            const data = request.result;
            if (data?.value) {
              //Data exists we update the value
              data.value = value;
              const requestUpdate = objectStore.put(data);

              requestUpdate.onerror = event => {
                reject(event)
              };
              requestUpdate.onsuccess = (event) => {
                resolve(requestUpdate.result)
              };
            } else {
              const requestAdd = objectStore.add({ key: key, value: value });

              requestAdd.onsuccess = () => {
                resolve(requestAdd.result)

              };
              requestAdd.onerror = event => {
                console.error(event)
                reject(event)
              };

            }
          };
        }
      });
    })

  }

  //Add item but not replace
  add = (key: string | number, value: StructuredCloneData): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {

          const objectStore = this.db.transaction([this.options.table], "readwrite").objectStore(this.options.table);
          const request = objectStore.get(key);
          request.onerror = event => {
            reject(event)
          };
          request.onsuccess = () => {
            const data = request.result;

            if (data?.value) {
              resolve(data.value)
            } else {

              const requestAdd = objectStore.add({ key: key, value: value });
              requestAdd.onsuccess = () => {
                resolve(requestAdd.result)

              };

              requestAdd.onerror = event => {
                reject(event)
              };
            }

          };
        } else {
          reject(new Error('db is not defined'))
        }

      });

    })
  }

  getItem = (key: string | number): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {
          const transaction = this.db.transaction([this.options.table]);
          const objectStore = transaction.objectStore(this.options.table);
          const request = objectStore.get(key);

          request.onerror = event => {
            reject(event)
          };

          request.onsuccess = () => {
            const data = request.result;
            if (data?.value) {
              resolve(data.value)
            } else {
              resolve(null)
            }

          };
        } else {
          reject(new Error('db is not defined'))
        }
      });
    })
  }
  /**
   * 
   * @returns Promise<Array<any> | null>
   */
  getAll = (): Promise<Array<any> | null> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {
          const transaction = this.db.transaction([this.options.table]);
          const objectStore = transaction.objectStore(this.options.table);
          const request = objectStore.getAll();

          request.onerror = event => {
            reject(event)
          };

          request.onsuccess = () => {
            const data = request.result;
            if (data) {
              resolve(data)
            } else {
              resolve(null)
            }

          };
        } else {
          reject(new Error('db is not defined "getAll()"'))
        }
      });
    })
  }
  /**
   * 
   * @param key 
   * @returns 
   */
  removeItem = (key: string | number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      this.ready.then(() => {
        if (this.db) {
          const request = this.db.transaction([this.options.table], "readwrite")
            .objectStore(this.options.table)
            .delete(key);
          request.onsuccess = () => {
            resolve(true)
          };

          request.onerror = event => {
            reject(event)
          };
        } else {
          reject(new Error('db is not defined "removeItem()"'))
        }
      });
    });
  }

}

export default IndexedKV;
