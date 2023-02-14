import IndexedKV from "../IndexedKV";
import ChannelStore from "./Channel.Store";
export interface Contacts {
    [key: string]: string;
}
export interface ChannelStores {
    [key: string]: ChannelStore;
}
/**
 * @class SnackabraStore
 *
 * @description
 * Interfaces with Snackabra and IndexedKV and provides a MobX store.
 * Specifically, this class is responsible for:
 * - Managing the state of multiple Snackabra instances
 * - Providing a MobX store for the UI
 * - Handles global operations on Snackabra instances
 */
declare class SnackabraStore {
    activeRoom: string | undefined;
    SnackabraStoreReadyFlag: Promise<unknown>;
    readyResolver: Function | undefined;
    channelList: ChannelStores;
    contacts: Contacts;
    cacheDb: IndexedKV;
    constructor();
    suspend: () => void;
    init: () => Promise<void>;
    get channels(): ChannelStores;
    set channels(channels: ChannelStores);
    /**
     * @description
     * Imports a channel from a JSON file
     *
     * @param roomData
     * @returns
     */
    importKeys: (channel: object) => Promise<unknown>;
}
export default SnackabraStore;
