import { makeAutoObservable, onBecomeUnobserved, toJS } from "mobx";
import IndexedKV from "../IndexedKV";
import ChannelStore, { ChannelOptions } from "./Channel.Store";
import { Channel, ChannelSocket, SBCrypto, SBServer, Snackabra } from "snackabra"


export interface Contacts {
  [key: string]: string;
}

/**
 * @interface ChannelObject
 * A simple object that represents minimal channel information.
 * This is used to populate the channel list to provide a easy serilizable object.
 */

export interface ChannelObject {
  _id: string;
  order: number;
  metadata: ChannelObjectMetadata;
  store?: ChannelStore;
}

export interface ChannelObjectMetadata {
  name?: string;
  options?: ChannelOptions;
  createdAt?: string;
  updatedAt?: string;
  accessedAt?: string;
}


export interface ChannelStores {
  [key: string]: ChannelObject;
}

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
 * @class SnackabraStore
 * 
 * @description 
 * Interfaces with Snackabra and IndexedKV and provides a MobX store.
 * Specifically, this class is responsible for:
 * - Oversight of multiple Snackabra instances
 * - Providing a MobX store for the UI
 * - Handles global operations on Snackabra instances
 *  - Creating new channels
 *  - Connecting to existing channels
 *  - Importing channels from JSON
 *  - Exporting channels to JSON
 */
class SnackabraStore {

  activeChannel: string | undefined;

  SnackabraStoreReadyFlag = new Promise((resolve: Function) => {
    this.readyResolver = resolve
  })
  readyResolver: Function | undefined;
  private channelList: ChannelStores = {}
  contacts: Contacts = {}
  cacheDb: IndexedKV;
  SB: Snackabra;
  Crypto: SBCrypto;
  sbConfig: SBServer = {
    channel_server: 'https://channel.384co.workers.dev',
    channel_ws: 'wss://channel.384co.workers.dev',
    storage_server: 'https://storage.384co.workers.dev'
  }

  constructor() {
    this.SB = new Snackabra(this.sbConfig);
    this.Crypto = new SBCrypto();
    this.cacheDb = new IndexedKV({ db: 'sb_data', table: 'cache' })
    makeAutoObservable(this)
    onBecomeUnobserved(this, "channelList", this.suspend);
    this.load()
  }

  /**
   * @description a reviver function for loading channels from IndexedKV
   * 
   * @param channels 
   * @returns 
   */
  private loadChannels = (channels: Array<ChannelObject>) => {
    let channelList: ChannelStores = {}
    channels.forEach((channel) => {
      channelList[channel._id] = {
        _id: channel._id,
        order: channel.order,
        metadata: channel.metadata,
        store: new ChannelStore(this.cacheDb, this.SB, this.Crypto, channel.metadata.options)
      }
    })
    return channelList
  }

  suspend = () => {
    // This will be used later to offload the state of the room to a local store
    this.save();
  };

  save = (): void => {
    this.cacheDb.setItem('sb_data_contacts', this.contacts)
    this.cacheDb.setItem('sb_data_channels', this.channels)
  };

  load = async () => {
    try {
      const migrated = await this.cacheDb.getItem('sb_data_migrated');
      const channels = await this.cacheDb.getItem('sb_data_channels');
      const contacts = await this.cacheDb.getItem('sb_data_contacts');
      if (migrated?.version && migrated?.version === 3) {
        if (channels) {
          this.channels = this.loadChannels(channels)
          this.contacts = contacts
        }
      }

      if (migrated?.version && migrated?.version === 2) {
        if (channels) {
          let _contacts: Contacts = {}
          let _channels: ChannelStores = {}
          let i = 0
          for (let x in Object.keys(channels)) {
            let options = {
              name: channels[x].name,
            }
            let _channel: ChannelObject = {
              _id: channels[x]._id,
              order: Object.keys(channels).indexOf(x),
              metadata: { options: options },
              store: new ChannelStore(this.cacheDb, this.SB, options)
            }
            _channels[channels[x]._id] = _channel
            _contacts = Object.assign(_contacts, channels[x].contacts)
            i++
          }

          this.contacts = _contacts
          this.channels = _channels
        }
      }

      this.cacheDb.setItem('sb_data_migrated', {
        timestamp: Date.now(),
        version: 3
      }).then(() => {
        if (this.readyResolver) {
          this.readyResolver()
        }
      })

    } catch (e) {
      throw new Error('failed to initialize Snackabra.Store');
    }
  };

  @Ready
  get channels() {
    return this.channelList
  }

  set channels(channels) {
    this.channelList = channels
  }

  @Ready
  create = (options: ChannelOptions, secret: string) => {
    return new Promise((resolve, reject) => {
      const channelStore = new ChannelStore(this.cacheDb, this.SB, options)
      channelStore.create(secret).then((channel) => {
        if (channel._id) {
          this.channels[channel._id] = {
            _id: channel._id,
            order: Object.keys(this.channels).length,
            metadata: { options: options },
            store: channel
          }
          resolve(channelStore)
        } else {
          throw new Error('channel.id is undefined')
        }
      }).catch((e: Error) => {
        reject(e)
      })
    })
  }

  @Ready
  connect = (options: ChannelOptions) => {
    return new Promise((resolve, reject) => {
      if (options.id && this.channelList[options.id] instanceof ChannelStore) {
        resolve(this.channelList[options.id])
      } else {
        const channelStore = new ChannelStore(this.cacheDb, this.SB, options)
        channelStore.connect().then(() => {
          if (channelStore.id) {
            this.channelList[channelStore.id] = channelStore
            resolve(this.channelList[channelStore.id])
          } else {
            reject('channelStore.id is undefined')
          }
        }).catch((e) => {
          reject(e)
        })
      }
    })
  }

  /**
   * @description 
   * Imports a channel from a JSON file
   * 
   * @param roomData 
   * @returns 
   */
  @Ready
  importKeys = (channel: object) => {
    return new Promise((resolve, reject) => {
      let connectPromises: Array<Promise<T>> = [];
      Object.keys(roomData.roomData).forEach((room) => {
        const options = {
          roomId: room,
          messageCallback: (m) => { console.log(m) },
          key: roomData.roomData[room].key,
          name: roomData.roomMetadata[room].name,
          contacts: roomData.contacts
        }
        this.rooms[room] = {}
        this.rooms[room].id = room
        this.rooms[room].name = roomData.roomMetadata[room].name
        this.rooms[room].lastMessageTime = roomData.roomMetadata[room].lastMessageTime
        this.rooms[room].contacts = roomData.contacts;
        console.log(roomData.contacts)
        connectPromises.push(this.connect(options, true))
      })
      Promise.all(connectPromises).then(() => {

      }).catch((e) => {
        reject(e)
      }).finally(() => {
        this.save()
        resolve()
      })
    })

  };


  set contacts(contacts) {
    if (this.rooms[this.activeRoom]) {
      this.rooms[this.activeRoom].contacts = contacts;
      this.save();
    }
  }
  get contacts() {
    if (this.rooms[this.activeRoom]) {
      return this.rooms[this.activeRoom].contacts ? toJS(this.rooms[this.activeRoom].contacts) : {};
    }
    return {};
  }

}

export default SnackabraStore;