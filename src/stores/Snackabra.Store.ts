import { makeObservable, observable, action, computed, onBecomeUnobserved, toJS } from "mobx";
import IndexedKV from "../IndexedKV";
import ChannelStore, { ChannelOptions } from "./Channel.Store";
import { Channel, ChannelSocket, SBCrypto, SBServer, Snackabra } from "snackabra"


export interface Contacts {
  [key: string]: string;
}

export interface ChannelStores {
  [key: string]: ChannelStore;
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
 * - Managing the state of multiple Snackabra instances
 * - Providing a MobX store for the UI
 * - Handles global operations on Snackabra instances
 */
class SnackabraStore {

  activeRoom: string | undefined;

  SnackabraStoreReadyFlag = new Promise((resolve: Function) => {
    this.readyResolver = resolve
  })
  readyResolver: Function | undefined;
  channelList: ChannelStores = {}
  contacts: Contacts = {}
  cacheDb: IndexedKV;
  constructor() {

    this.cacheDb = new IndexedKV({ db: 'snackabra', table: 'cache' })
    makeObservable(this, {
      activeRoom: observable,
      channels: observable.shallow,
    });
    onBecomeUnobserved(this, "rooms", this.suspend);

  }

  suspend = () => {
    // This will be used later to offload the state of the room to a local store
    this.save();
  };

  init = async () => {
    try {
      const sb_data = JSON.parse(await this.cacheDb.getItem('sb_data'));
      const migrated = await this.cacheDb.getItem('sb_data_migrated');
      const channels = await this.cacheDb.getItem('sb_data_channels');
      if (migrated?.version === 2) {
        if (channels) {
          this.channels = channels
        }
      }
      let channelList = []
      if (sb_data && migrated?.version !== 2) {
        Object.keys(sb_data.rooms).forEach((channelId) => {
          for (let x in sb_data.rooms[channelId]) {
            if (this.channels[channelId]) {
              channelList.push({ _id: channelId, name: sb_data.channels[channelId].name })
              this.channels[roomId][x] = sb_data.rooms[roomId][x];
            }
          }
          this.cacheDb.setItem('sb_data_' + roomId, toJS(this.channels[roomId])).then(() => {
            delete this.channels[roomId];
          })
        })
      }
      this.cacheDb.setItem('sb_data_migrated', {
        timestamp: Date.now(),
        version: 2
      }).then(() => {
        if (this.readyResolver) {
          this.readyResolver()
        }
      })

      this.cacheDb = new IndexedKV({
        db: 'sb_data',
        table: 'cache'
      });
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

  create = (options: ChannelOptions, secret: string) => {
    return new Promise((resolve, reject) => {
      const channelStore = new ChannelStore(this.cacheDb, options)
      channelStore.create(secret).then(() => {
        if (channelStore.id) {
          this.channelList[channelStore.id] = channelStore
          resolve(channelStore)
        } else {
          reject('channelStore.id is undefined')
        }
      }).catch((e) => {
        reject(e)
      })
    })
  }

  connect = (options: ChannelOptions) => {
    return new Promise((resolve, reject) => {
      if (options.id && this.channelList[options.id] instanceof ChannelStore) {
        resolve(this.channelList[options.id])
      } else {
        const channelStore = new ChannelStore(this.cacheDb, options)
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

}

export default SnackabraStore;