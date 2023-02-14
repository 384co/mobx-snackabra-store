export declare module IndexedKV {
    interface IndexedKVOptions {
        db: string;
        table: string;
    }
}
interface IndexedKVOptions {
    db: string;
    table: string;
}
export type StructuredCloneData = Exclude<unknown, Function>;
/**
 * @description
 * IndexedKV is a wrapper around IndexedDB that provides a simple interface for
 * storing and retrieving data.
 */
declare class IndexedKV {
    private indexedDB;
    private readyResolver;
    db: IDBDatabase | undefined;
    IndexedKVReadyFlag: Promise<unknown>;
    options: IndexedKVOptions;
    constructor(options: IndexedKVOptions | undefined);
    /**
     * @description Select what database to use
     */
    private useDatabase;
    /**
     * Similar to "Select * WHERE $regex" implementation
     * Matches the key against the regex and returns the value
     *
     * @param regex {Regular expression matcher}
     * @param {Function=} callback
     * @returns {Promise<Array<IDBRequest["result"]>>}
     */
    openCursor(regex: RegExp, callback?: Function): Promise<Array<IDBRequest["result"]>>;
    /**
     * setItem will add or replace an entry by key
     *
     * @param {string | number} key
     * @param {StructuredCloneData} value
     * @returns {Promise<IDBValidKey>}
     */
    setItem(key: string | number, value: StructuredCloneData): Promise<IDBValidKey>;
    /**
     * @description
     * Add an item to the database
     *
     * @param {string | number} key
     * @param {StructuredCloneData} value
     * @returns {Promise<IDBValidKey | IDBRequest["result"]>}
     */
    add(key: string | number, value: StructuredCloneData): Promise<IDBValidKey | IDBRequest["result"]>;
    /**
     * @description
     * Get an item from the database
     *
     * @param {string | number} key
     * @returns
     */
    getItem(key: string | number): Promise<IDBRequest["result"]>;
    /**
     *@description
     * Get all items from the database
     *
     * @returns {Promise<Array<any> | null>}
     */
    getAll(): Promise<Array<IDBRequest["result"]> | null>;
    /**
     * @description
     * Remove an item from the database
     *
     * @param {string | number} key
     * @returns {Promise<boolean>}
     */
    removeItem(key: string | number): Promise<boolean>;
}
export default IndexedKV;
