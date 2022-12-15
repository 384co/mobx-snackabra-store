import { makeObservable, observable, action, computed, onBecomeUnobserved, configure, toJS } from "mobx";
import { textChangeRangeIsUnchanged } from "typescript";
import IndexedKV from "../IndexedKV";
const SB = require('snackabra');
let cacheDb;
configure({
  useProxies: "never"
});
class SnackabraStore {
  sbConfig = {
    channel_server: 'https://r.384co.workers.dev',
    channel_ws: 'wss://r.384co.workers.dev',
    storage_server: 'https://s.384co.workers.dev'
  };
  channel;
  storage;
  rooms = {};
  locked = false;
  isVerifiedGuest = false;
  roomMetadata = {};
  userName = 'Me';
  ownerRotation;
  ownerKey;
  roomCapacity = 20;
  keys = {};
  userKey = {};
  sharedKeyProp = false;
  //might be more of a local state thing
  loadingMore = false;
  lockEncryptionKey = false;
  lastMessageTimeStamp = 0;
  lastSeenMessageId;
  moreMessages = false;
  replyTo;
  activeRoom;
  channelList = {};
  joinRequests = {};
  SB = {};
  Crypto = {};
  constructor(sbConfig) {
    this.config = sbConfig ? sbConfig : toJS(this.sbConfig);
    this.SB = new SB.Snackabra(this.config);
    this.Crypto = new SB.SBCrypto();
    this.storage = this.SB.storage;
    if (!sbConfig) {
      console.log('Using default servers in Snackabra.store', this.sbConfig);
    }
    makeObservable(this, {
      createRoom: action,
      setRoom: action,
      importRoom: action,
      replyEncryptionKey: action,
      user: computed,
      channels: computed,
      username: computed,
      socket: computed,
      admin: computed,
      roomName: computed,
      motd: computed,
      activeroom: computed,
      messages: computed,
      contacts: computed,
      lockKey: computed,
      lastMessageTime: computed,
      lastSeenMessage: computed,
      sharedKey: computed,
      lastSeenMessageId: observable,
      lockEncryptionKey: observable,
      loadingMore: observable,
      sbConfig: observable,
      roomMetadata: observable,
      userName: observable,
      rooms: observable,
      locked: observable,
      isVerifiedGuest: observable,
      ownerRotation: observable,
      roomCapacity: observable,
      replyTo: observable,
      activeRoom: observable,
      keys: observable,
      userKey: observable,
      ownerKey: observable,
      joinRequests: observable,
      channel: observable,
      storage: observable
    });
    onBecomeUnobserved(this, "rooms", this.suspend);
  }
  resume = () => {
    // This will be used later to load the state of the room from a local store
    console.log(`Resuming...`);
  };
  suspend = () => {
    // This will be used later to offload the state of the room to a local store
    this.save();
    console.log(`Suspending`, this);
  };
  init = () => {
    return new Promise(resolve => {
      try {
        // const start = async () => {
        //   const sb_data = JSON.parse(await cacheDb.getItem('sb_data'));
        //   for (let x in sb_data) {
        //     if (x !== 'SB' && x !== "sbConfig" && x !== "Crypto") {
        //       this[x] = sb_data[x];
        //     }
        //   }
        //   resolve('success');
        // };

        const start = async () => {
          const sb_data = JSON.parse(await cacheDb.getItem('sb_data'));
          const migrated = await cacheDb.getItem('sb_data_migrated');
          const channels = await cacheDb.getItem('sb_data_channels');
          console.log(migrated)
          if (migrated?.version === 2) {
            if(channels){
              this.channels = channels
            }
            resolve('success');
          }
          let channelList = []
          if (sb_data) {
            Object.keys(sb_data.rooms).forEach((roomId) => {
              for (let x in sb_data.rooms[roomId]) {
                if (!this.rooms[roomId]) {
                  this.rooms[roomId] = {}
                }
                channelList.push({ _id: roomId, name: sb_data.rooms[roomId].name })
                this.rooms[roomId][x] = sb_data.rooms[roomId][x];
              }
              cacheDb.setItem('sb_data_' + roomId, toJS(this.rooms[roomId])).then(() => {
                console.log(channelList)
                delete this.rooms[roomId];
              })
            })
          }
          cacheDb.setItem('sb_data_migrated', {
            timestamp: Date.now(),
            version: 2
          }).then(() => {
            resolve('success');
          })

        };
        cacheDb = new IndexedKV(window, {
          db: 'sb_data',
          table: 'cache',
          onReady: start
        });
      } catch (e) {
        console.error(e);
        reject('failed to initialize Snackabra.Store');
      }
    });
  };

  open = (callback) => {
    cacheDb = new IndexedKV(window, {
      db: 'sb_data',
      table: 'cache',
      onReady: callback
    });
  }

  save = () => {
    cacheDb.setItem('sb_data_' + this.activeroom, toJS(this.rooms[this.activeroom])).then(() => {
      this.channels[this.activeroom] = { _id: this.rooms[this.activeroom].id, name: this.rooms[this.activeroom].name }
      cacheDb.setItem('sb_data_channels', this.channels)
    })
  };

  get channels() {
    return toJS(this.channelList)
  }

  set channels(channelList) {
    this.channelList = channelList
  }

  get config() {
    return toJS(this.sbConfig);
  }

  set lastSeenMessage(messageId) {
    this.rooms[this.activeRoom].lastSeenMessageId = messageId;
  }
  get lastSeenMessage() {
    return toJS(this.rooms[this.activeRoom].lastSeenMessageId);
  }

  set lastMessageTime(timestamp) {
    this.rooms[this.activeRoom].lastMessageTime = timestamp;
  }
  get lastMessageTime() {
    return toJS(this.rooms[this.activeRoom].lastMessageTime);
  }

  set lockKey(lockKey) {
    this.rooms[this.activeRoom].lockEncryptionKey = lockKey;
  }
  get lockKey() {
    return toJS(this.rooms[this.activeRoom].lockEncryptionKey);
  }

  set config(config) {
    this.sbConfig = config;
  }
  set storage(storage) {
    this.storage = storage;
  }
  get storage() {
    return this.storage ? toJS(this.storage) : undefined;
  }
  get socket() {
    return this.channel ? toJS(this.channel) : undefined;
  }
  set socket(channel) {
    this.channel = channel;
  }
  get retrieveImage() {
    return this.storage;
  }
  get owner() {
    return this.socket ? this.socket.owner : false;
  }
  get admin() {
    return this.socket ? this.socket.admin : false;
  }
  set activeroom(channelId) {
    this.activeRoom = channelId;
  }
  get activeroom() {
    return this.activeRoom;
  }
  get username() {
    return this.userName;
  }
  get roomName() {
    return this.rooms[this.activeRoom]?.name ? this.rooms[this.activeRoom].name : 'Room ' + Math.floor(Object.keys(this.channels).length + 1);
  }
  set roomName(name) {
    this.rooms[this.activeRoom].name = name;
    this.save();
  }
  get user() {
    return this.socket ? {
      _id: JSON.stringify(this.socket.exportable_pubKey),
      name: this.socket.userName
    } : {
      _id: '',
      name: ''
    };
  }
  set username(userName) {
    if (this.rooms[this.activeRoom]) {
      this.rooms[this.activeRoom].userName = userName;
      const user_pubKey = this.user._id;
      this.rooms[this.activeRoom].contacts[user_pubKey.x + ' ' + user_pubKey.y] = userName;
      this.userName = userName;
      this.save();
    }
  }
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
  get messages() {
    if (this.rooms[this.activeRoom]) {
      return this.rooms[this.activeRoom].messages ? toJS(this.rooms[this.activeRoom].messages) : [];
    }
    return [];
  }
  set messages(messages) {
    if (this.rooms[this.activeRoom]) {
      this.rooms[this.activeRoom].messages = messages;
      this.rooms[this.activeRoom].lastMessageTimeStamp = messages[messages.length - 1] !== undefined ? messages[messages.length - 1].timestampPrefix : 0
      this.rooms[this.activeRoom].lastSeenMessage = messages[messages.length - 1] !== undefined ? messages[messages.length - 1]._id : ""
      this.save();
    }
  }

  set sharedKey(key) {
    this.rooms[this.activeroom].sharedKey = key;
  }

  get sharedKey() {
    return toJS(this.rooms[this.activeroom].sharedKey);
  }

  async replyEncryptionKey(recipientPubkey) {
    return this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", JSON.parse(recipientPubkey), "ECDH", true, []), "AES", false, ["encrypt", "decrypt"])
  }


  SBMessage = message => {
    return new SB.SBMessage(this.socket, message);
  };
  receiveMessage = async (m, messageCallback) => {
    const user_pubKey = m.user._id;
    m.user._id = JSON.stringify(m.user._id);
    if (this.contacts[user_pubKey.x + ' ' + user_pubKey.y] === undefined) {
      const contacts = this.contacts;
      contacts[user_pubKey.x + ' ' + user_pubKey.y] = m.user.name
      this.contacts = contacts
    }
    m.user.name = this.contacts[user_pubKey.x + ' ' + user_pubKey.y]
    m.sender_username = m.user.name;
    m.createdAt = new Date(parseInt(m.timestampPrefix, 2));
    // For whispers
    if (m.whispered === true) {
      m.text = "(whispered)"
      try {
        if (m.whisper && this.socket.owner && !m.reply_to) {
          const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.sender_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
          m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
          m.text = m.contents
        }
        if (m.whisper && this.Crypto.compareKeys(m.sender_pubKey, this.socket.exportable_pubKey) && !m.reply_to) {
          const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", this.socket.exportable_owner_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
          m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
          m.text = m.contents
        }
        if (m.reply_to && this.socket.owner) {
          const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.reply_to, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
          m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
          m.text = m.contents
        }
        if (m.reply_to && this.Crypto.compareKeys(m.reply_to, this.socket.exportable_pubKey)) {
          const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", this.socket.exportable_owner_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
          m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
          m.text = m.contents
        }

      } catch (e) {
        console.warn(e)
      }

    }
    this.rooms[this.activeRoom].lastMessageTime = m.timestampPrefix;
    this.rooms[this.activeRoom].lastSeenMessage = m._id
    this.rooms[this.activeRoom].messages = [...toJS(this.rooms[this.activeRoom].messages), m];
    this.save();
    messageCallback(m);
  };
  #mergeMessages = (existing, received) => {
    let merged = [];
    for (let i = 0; i < existing.length + received.length; i++) {
      if (received.find(itmInner => itmInner._id === existing[i]?._id)) {
        merged.push({
          ...existing[i],
          ...received.find(itmInner => itmInner._id === existing[i]?._id)
        });
      } else {
        if (received[i]) {
          const user_pubKey = received[i].user._id;
          if (this.contacts[user_pubKey.x + ' ' + user_pubKey.y] === undefined) {
            const contacts = this.contacts;
            contacts[user_pubKey.x + ' ' + user_pubKey.y] = received[i].user.name
            this.contacts = contacts
          }
          merged.push(received[i]);
        }
      }
    }
    return merged.sort((a, b) => a._id > b._id ? 1 : -1);
  };
  getOldMessages = length => {
    return new Promise(resolve => {
      this.socket.api.getOldMessages(length).then(async (r_messages) => {
        for (let x in r_messages) {
          let m = r_messages[x]
          // For whispers
          if (m.whispered === true) {
            m.text = "(whispered)"
            try {
              if (m.whisper && this.socket.owner && !m.reply_to) {
                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.sender_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                m.text = m.contents
              }
              if (m.whisper && this.Crypto.compareKeys(m.sender_pubKey, this.socket.exportable_pubKey) && !m.reply_to) {
                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", this.socket.exportable_owner_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                m.text = m.contents
              }
              if (m.reply_to && this.socket.owner) {
                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.reply_to, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                m.text = m.contents
              }
              if (m.reply_to && this.Crypto.compareKeys(m.reply_to, this.socket.exportable_pubKey)) {
                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", this.socket.exportable_owner_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                m.text = m.contents
              }

            } catch (e) {
              console.warn(e)
            }

          }
          r_messages[x] = m
        }
        this.rooms[this.activeRoom].messages = this.#mergeMessages(toJS(this.rooms[this.activeRoom].messages), r_messages);
        this.save();
        resolve(r_messages);
      });
    });
  };
  createRoom = secret => {
    return new Promise((resolve, reject) => {
      // create a new channel (room), returns (owner) key and channel name:
      this.SB.create(this.config, secret).then(handle => {
        console.log(`you can (probably) connect here: localhost:3000/rooms/${handle.channelId}`);
        // connect to the websocket with our handle info:
        this.SB.connect(
          // must have a message handler:
          m => {
            this.receiveMessage(m);
          }, handle.key,
          // if we omit then we're connecting anonymously (and not as owner)
          handle.channelId // since we're owner this is optional
        ).then(c => c.ready).then(c => {
          if (c) {
            this.socket = c;
            this.activeroom = handle.channelId;
            this.socket.userName = 'Me';
            this.rooms[handle.channelId] = {
              name: 'Room ' + Math.floor(Object.keys(this.channels).length + 1),
              id: handle.channelId,
              key: handle.key,
              userName: 'Me',
              sharedKey: false,
              lastSeenMessage: 0,
              contacts: {},
              messages: []
            };
            this.save();
          }
          resolve(handle.channelId);
          // say hello to everybody! upon success it will return "success"
          // (new SBMessage(c, "Hello from TestBot!")).send().then((c) => { console.log(`test message sent! (${c})`) })
        }).catch(e => {
          reject(e);
        });
      });
    });
  };

  importKeys = async roomData => {
    console.log(roomData);
    let connectPromises = [];
    Object.keys(roomData.roomData).forEach((room) => {
      const options = {
        roomId: room,
        messageCallback: (m) => { console.log(m) },
        key: roomData.roomData[room].key,
      }
      connectPromises.push(this.connect(options))
    })
    Promise.all(connectPromises).then((r) => {
      console.log(r)
      Object.keys(roomData.roomData).forEach((room) => {
        this.rooms[this.activeRoom].contacts = roomData.contacts;
      })
      this.save()
    })
  };

  importRoom = async roomData => {
    const channelId = roomData.roomId;
    const key = JSON.parse(roomData.ownerKey);
    try {
      this.SB.connect(console.log, key, channelId).then(c => c.ready).then(c => {
        if (c) {

          this.socket = c;
          this.activeroom = channelId;
          const roomData = this.rooms[channelId] ? this.rooms[channelId] : {
            name: 'Room ' + Math.floor(Object.keys(this.rooms).length + 1),
            id: channelId,
            key: typeof key !== 'undefined' ? key : c.exportable_privateKey,
            userName: 'Me',
            contacts: {},
            lastSeenMessage: 0,
            // sharedKey: 
            messages: []
          };
          this.setRoom(channelId, roomData);
          this.key = typeof key !== 'undefined' ? key : c.exportable_privateKey;
          this.socket.userName = 'Me';
          this.save();
          window.location.reload();
        }
      }).catch(e => {
        console.error(e);
      });
    } catch (e) {
      console.error(e);
    }
  };
  get capacity() {
    return this.socket ? this.socket.adminData.capacity : 20;
  }
  setRoomCapacity = capacity => {
    this.socket.adminData.capacity = capacity;
    return this.socket.api.updateCapacity(capacity);
  };
  get motd() {
    return this.socket ? this.socket.motd : '';
  }
  set motd(motd) {
    console.log(motd);
  }
  setMOTD = motd => {
    return this.socket.api.setMOTD(motd);
  };

  // This isnt in the the jslib atm
  lockRoom = () => {
    return this.socket.api.lockRoom();
  };
  getExistingRoom = channelId => {
    return toJS(this.rooms[channelId]);
  };
  setMessages = (channelId, messages) => {
    return this.rooms[channelId].messages = messages;
  };
  getMessages = channelId => {
    if (this.rooms[channelId]) {
      return toJS(this.rooms[channelId].messages);
    } else {
      return [];
    }
  };
  setRoom = (channelId, roomData) => {
    this.rooms[channelId] = roomData;
    this.activeroom = channelId;
  };
  connect = async ({
    roomId,
    username,
    messageCallback,
    key,
    secret
  }) => {
    return new Promise(async (resolve, reject) => {
      try {
        let channel, channelId;
        if (secret) {
          channel = await this.SB.create(this.config, secret);
        }
        key = key ? key : channel?.key;
        channelId = roomId ? roomId : channel?.channelId;
        this.SB.connect(m => {
          this.receiveMessage(m, messageCallback);
        },
          // must have a message handler:
          key ? key : null,
          // if we omit then we're connecting anonymously (and not as owner)
          channelId // since we're owner this is optional
        ).then(c => c.ready).then(async (c) => {
          if (c) {
            console.log(c)
            this.socket = c;
            this.activeroom = channelId;
            const roomData = this.rooms[channelId] ? this.rooms[channelId] : {
              name: 'Room ' + Math.floor(Object.keys(this.channels).length + 1),
              id: channelId,
              key: typeof key !== 'undefined' ? key : c.exportable_privateKey,
              userName: username !== '' && typeof username !== 'undefined' ? username : '',
              lastSeenMessage: 0,
              sharedKey: this.socket.owner ? false : await this.Crypto.deriveKey(this.socket.keys.privateKey, this.socket.keys.ownerKey, "AES", false, ["encrypt", "decrypt"]),
              contacts: {},
              messages: []
            };
            this.setRoom(channelId, roomData);
            this.key = typeof key !== 'undefined' ? key : c.exportable_privateKey;
            this.socket.userName = roomData.userName;
            this.sharedKey = this.socket.owner ? false : await this.Crypto.deriveKey(this.socket.keys.privateKey, this.socket.keys.ownerKey, "AES", false, ["encrypt", "decrypt"])
            this.save();
          }
          resolve('connected');
        }).catch(e => {
          reject(e);
        });
      } catch (e) {
        reject(e);
      }
    });
  };
  // getRooms = () => {
  //   return this.rooms;
  // };

  getChannel = (channel)=>{
    return new Promise((resolve)=>{
      cacheDb.getItem('sb_data_' + channel).then((data) => {
        resolve(data)
      })
    })
  }

  downloadRoomData = () => {
    return new Promise((resolve) => {
      this.socket.api.downloadData().then((data) => {
        console.log(data)
        data.storage.target = window.location.host
        resolve(data)
      })
    })
  };
}

export default SnackabraStore;