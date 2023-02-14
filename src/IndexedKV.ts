export declare module IndexedKV {
  export interface IndexedKVOptions {
    db: string,
    table: string
  }
}


export type StructuredCloneData = Exclude<unknown, Function>

const Ready = (...args: any[]) => {
  let target = args[0]
  let descriptor = args[2]
  const originalMethod = descriptor.value;
  descriptor.value = async function () {
    const obj = target.constructor.name
    const prop = `${obj}ReadyFlag`
    if (prop in this) {
      await this[prop]
    }
    return originalMethod.apply(this, arguments);

  }
}

/**
 * @description
 * IndexedKV is a wrapper around IndexedDB that provides a simple interface for
 * storing and retrieving data.
 */
class IndexedKV {

  private indexedDB: IDBFactory;
  private readyResolver: Function | undefined;

  public db: IDBDatabase | undefined;
  public IndexedKVReadyFlag = new Promise((resolve) => {
    this.readyResolver = resolve
  })
  public options: IndexedKV.IndexedKVOptions = {
    db: 'MyDB',
    table: 'default'
  }

  constructor(options: IndexedKV.IndexedKVOptions | undefined) {
    this.options = Object.assign(this.options, options)
    if (!window.indexedDB) {
      throw new Error("Your browser doesn't support a stable version of IndexedDB.");
    }
    this.indexedDB = window.indexedDB;
    const openReq = this.indexedDB.open(this.options.db);

    openReq.onerror = event => {
      console.error("Database error: " + event);
      throw new Error("Database error: " + event);
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
   * @description Select what database to use
   */
  private useDatabase(): void {
    const newReq = this.indexedDB.open(this.options.db);
    newReq.onsuccess = () => {
      this.db = newReq.result;
      if (this.readyResolver) {
        this.readyResolver(true)
      }
    };
    newReq.onerror = event => {
      console.error(event);
      throw new Error("Database error: " + event);
    };

    newReq.onupgradeneeded = () => {
      this.db = newReq.result;
    };
  }
  /**
   * Similar to "Select * WHERE $regex" implementation
   * Matches the key against the regex and returns the value
   * 
   * @param regex {Regular expression matcher}
   * @param {Function=} callback
   * @returns {Promise<Array<IDBRequest["result"]>>}
   */
  @Ready
  openCursor(regex: RegExp, callback?: Function): Promise<Array<IDBRequest["result"]>> {
    return new Promise((resolve, reject) => {
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
    })
  }

  /**
   * setItem will add or replace an entry by key
   * 
   * @param {string | number} key
   * @param {StructuredCloneData} value
   * @returns {Promise<IDBValidKey>}
   */
  @Ready
  setItem(key: string | number, value: StructuredCloneData): Promise<IDBValidKey> {
    return new Promise((resolve, reject) => {
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
    })

  }

  /**
   * @description
   * Add an item to the database
   * 
   * @param {string | number} key
   * @param {StructuredCloneData} value
   * @returns {Promise<IDBValidKey | IDBRequest["result"]>}
   */
  @Ready
  add(key: string | number, value: StructuredCloneData): Promise<IDBValidKey | IDBRequest["result"]> {
    return new Promise((resolve, reject) => {
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


    })
  }

  /**
   * @description
   * Get an item from the database
   * 
   * @param {string | number} key
   * @returns 
   */
  @Ready
  public getItem(key: string | number): Promise<IDBRequest["result"]> {
    return new Promise((resolve, reject) => {
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
    })
  }

  /**
   *@description
   * Get all items from the database 
   * 
   * @returns {Promise<Array<any> | null>}
   */
  @Ready
  getAll(): Promise<Array<IDBRequest["result"]> | null> {
    return new Promise((resolve, reject) => {
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
    })
  }

  /**
   * @description
   * Remove an item from the database
   * 
   * @param {string | number} key
   * @returns {Promise<boolean>}
   */
  @Ready
  removeItem(key: string | number): Promise<boolean> {
    return new Promise((resolve, reject) => {
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
  }

}

export default IndexedKV;
