import { makeAutoObservable, onBecomeUnobserved, toJS } from "mobx";
import IndexedKV from "../IndexedKV";
import { Channel, ChannelSocket, SBCrypto, SBServer, Snackabra, SBMessage, ChannelKeys } from "snackabra"
import { JsonWebKey } from "crypto";
let cacheDb: IndexedKV;

export interface ChannelData {
    [key: string]: {
        key: JsonWebKey;
        lastSeenMessage: string;
    }
}

export interface ChannelMetadata {
    [key: string]: {
        name: string;
        lastMessageTime: string;
        unread: boolean;
    }
}

export interface ChannelOptions {
    name?: string;
    key?: JsonWebKey;
    messageCallback?: (message: any) => void;
}

export interface SerializedChannel {
    _id: string;
    key: JsonWebKey;
    name: string;
    userName: string;
    lastSeenMessage: number;
    sharedKey: boolean | JsonWebKey;
    messages: SBMessage[];
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
        if (typeof this.socket === 'undefined') {
            throw new Error('Socket is undefined')
        }
        return originalMethod.apply(this, arguments);

    }
}



/**
 * @class ChannelStore
 * 
 * @description
 * Interface to Snackabra on a per channel basis.
 * Specifically, this class is responsible for:
 * - Creating a Snackabra instance
 * - Creating a Snackabra channel socket instance
 * - Creating a Snackabra channel storage instance
 * - Creating a Snackabra channel crypto instance
 * - Orchestrating the Snackabra channel socket and storage instances
 */
class ChannelStore {
    // Default sbConfig
    _id: string | undefined;
    readyResolver: Function | undefined
    // ready = new Promise((resolve: Function) => {
    //     this.readyResolver = resolve
    // })
    ChannelStoreReadyFlag = new Promise((resolve: Function) => {
        this.readyResolver = resolve
    })
    cacheDb: IndexedKV;
    channel?: Snackabra["channel"];
    storage?: Snackabra["storage"];
    rooms = {};
    locked = false;
    isVerifiedGuest = false;
    roomMetadata = {};
    userName = 'Me';
    roomCapacity = 20;
    keys?: ChannelKeys;
    userKey?: JsonWebKey;
    sharedKey?: JsonWebKey;
    sharedKeyProp = false;
    //might be more of a local state thing
    loadingMore = false;
    lockEncryptionKey = false;
    lastMessageTime = 0;
    lastSeenMessage = 0;
    ownerKey: string | undefined;
    moreMessages = false;
    joinRequests = {};
    name?: string = 'Unnamed Channel';
    metadata?: ChannelMetadata;
    SB: Snackabra;
    Crypto: SBCrypto;
    messages: SBMessage[] = [];
    messageCallback?: (message: any) => void;

    constructor(cacheDb: IndexedKV, SB: Snackabra, Crypto: SBCrypto, options: ChannelOptions | undefined) {
        this.SB = SB;
        this.cacheDb = cacheDb;
        this.Crypto = Crypto;
        if (options) {
            for (let x in options) {
                switch (x) {
                    case 'name':
                        this.name = options.name;
                        break;
                    case 'key':
                        this.userKey = options.key as JsonWebKey;
                        break;
                    case 'messageCallback':
                        this.messageCallback = options.messageCallback;
                        break;
                }
            }
        }
        this.cacheDb = cacheDb;
        this.storage = SB.storage;
        makeAutoObservable(this)
        onBecomeUnobserved(this, "rooms", this.suspend);
    }

    suspend = () => {
        // This will be used later to offload the state of the room to a local store
        this.save();
    };

    private loadFromCache = (channelId: string): Promise<SerializedChannel | false> => {
        return new Promise(async (resolve, reject) => {
            try {
                const channel = await cacheDb.getItem('sb_data_' + channelId);
                if (channel) {
                    resolve(channel);
                } else {
                    resolve(false);
                }
            } catch (e) {
                reject(e);
            }
        });
    };

    create = (secret: string): Promise<this> => {
        return new Promise((resolve, reject) => {
            // create a new channel (room), returns (owner) key and channel name:
            this.SB.create(this.config, secret).then(handle => {
                console.log(`you can (probably) connect here: localhost:3000/rooms/${handle.channelId}`);
                // connect to the websocket with our handle info:
                this.SB.connect(
                    // must have a message handler:
                    m => {
                        this.receiveMessage(m, console.log);
                    }, handle.key,
                    // if we omit then we're connecting anonymously (and not as owner)
                    handle.channelId // since we're owner this is optional
                ).then(c => c.ready).then(c => {
                    if (c) {

                        this.socket = c;
                        this.activeroom = handle.channelId;
                        this.userName = 'Me';
                        this.sharedKey = false;
                        this.lastSeenMessage = 0;
                        this.messages = [];
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
                        if (this.readyResolver) {
                            this.readyResolver()
                        }
                        this.save();
                    }

                    resolve(this);

                }).catch(e => {
                    reject(e);
                });
            }).catch(e => {
                reject(e);
            });
        });
    };

    connect = (id: string, key?: JsonWebKey, roomName?: string, userName?: string): Promise<this> => {
        this.userKey = key;
        this._id = id;
        return new Promise(async (resolve, reject) => {
            try {
                this.SB.connect(
                    (m) => {
                        this.receiveMessage(m, this.messageCallback);
                    },
                    this.userKey,
                    this._id
                ).then(c => c.ready).then(async (c) => {
                    if (c) {
                        this.socket = c;
                        this.keys = c.keys;
                        if (this.socket.channelId) {
                            this.loadFromCache(this.socket.channelId).then(async (channel) => {
                                let roomData;
                                if (channel) {
                                    roomData = channel;
                                } else {
                                    roomData = {
                                        name: roomName ? roomName : 'Room ' + Math.floor(Object.keys(this.channels).length + 1),
                                        id: this._id,
                                        key: typeof this.userKey !== 'undefined' ? this.userKey : c.exportable_privateKey,
                                        userName: userName !== '' && typeof userName !== 'undefined' ? userName : 'Unnamed',
                                        lastSeenMessage: 0,
                                        sharedKey: this.socket!.owner ? false : await this.Crypto.deriveKey(this.socket!.keys.privateKey, this.socket!.keys.ownerKey, "AES", false, ["encrypt", "decrypt"]),
                                        messages: []
                                    }
                                }
                                this.name = roomData.name;
                                this._id = roomData._id;
                                this.userName = roomData.userName;
                                this.sharedKey = roomData.sharedKey as JsonWebKey;
                                this.lastSeenMessage = roomData.lastSeenMessage;
                                if (this.readyResolver) {
                                    this.readyResolver()
                                }
                                resolve(this);
                            })
                        } else {
                            reject('Failed to connect to channel')
                        }
                    }
                }).catch(e => {
                    reject(e);
                });
            } catch (e) {
                reject(e);
            }
        });
    };

    save = (): void => {

        cacheDb.setItem('sb_data_' + this._id, toJS(this)).then(() => {
            console.log('sb_data_' + this._id + " saved")
        })
    };

    set lockKey(lockKey) {
        this.keys.lockEncryptionKey = lockKey;
    }
    get lockKey() {
        return this.keys.lockEncryptionKey;
    }

    get socket() {
        return this.channel ? toJS(this.channel) : undefined;
    }
    set socket(channel) {
        this.channel = channel;
    }

    get isOwner() {
        return this.socket ? this.socket.owner : false;
    }

    get isAdmin() {
        return this.socket ? this.socket.admin : false;
    }

    updateChannelName = (name: string) => {
        this.name = name;
        this.save();
    }

    get user() {
        return {
            _id: this.socket!.exportable_pubKey,
            name: this.socket!.userName
        }
    }
    set username(userName: string) {

        this.userName = userName;
        const user_pubKey = this.user._id;
        this.contacts[user_pubKey!.x + ' ' + user_pubKey!.y] = userName;
        this.userName = userName;
        this.save();
    }

    async replyEncryptionKey(recipientPubkey: string) {
        return this.Crypto.deriveKey(this.keys.privateKey, await this.Crypto.importKey("jwk", JSON.parse(recipientPubkey), "ECDH", true, []), "AES", false, ["encrypt", "decrypt"])
    }

    SBMessage = (message: string) => {
        if (!this.socket)
            throw new Error('Not connected to a channel')

        return new SBMessage(this.socket, message);
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
        this.lastMessageTime = m.timestampPrefix;
        this.lastSeenMessage = m._id
        this.messages = [...toJS(this.messages), m];
        this.save();
        messageCallback(m);
    };

    #mergeMessages = (existing: any[], received: any[]) => {
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
    getOldMessages = (length: number) => {
        return new Promise(resolve => {
            if (!this.socket)
                throw new Error('Not connected to a channel')
            this.socket.api.getOldMessages(length).then(async (r_messages: any[]) => {
                for (let x in r_messages) {
                    let m = r_messages[x]
                    // For whispers
                    if (m.whispered === true) {
                        m.text = "(whispered)"
                        try {
                            if (m.whisper && this.socket?.owner && !m.reply_to) {
                                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.sender_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                                m.text = m.contents
                            }
                            if (this.socket?.exportable_pubKey && m.whisper && this.Crypto.compareKeys(m.sender_pubKey, this.socket.exportable_pubKey as JsonWebKey) && !m.reply_to) {
                                const shared_key = await this.Crypto.deriveKey(this.socket?.keys.privateKey, await this.Crypto.importKey("jwk", this.socket.exportable_owner_pubKey, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                                m.text = m.contents
                            }
                            if (m.reply_to && this.socket?.owner) {
                                const shared_key = await this.Crypto.deriveKey(this.socket.keys.privateKey, await this.Crypto.importKey("jwk", m.reply_to, "ECDH", true, []), "AES", false, ["encrypt", "decrypt"]);
                                m.contents = await this.Crypto.unwrap(shared_key, m.whisper, 'string')
                                m.text = m.contents
                            }
                            if (this.socket?.exportable_pubKey && m.reply_to && this.Crypto.compareKeys(m.reply_to, this.socket.exportable_pubKey)) {
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
                this.messages = this.#mergeMessages(toJS(this.messages), r_messages);
                this.save();
                resolve(r_messages);
            });
        });
    };

    importRoom = async (roomData: SerializedChannel) => {
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

    //TODO: This isnt in the the jslib atm
    @Ready
    lockRoom = () => {
        return new Promise((resolve, reject) => {
            try {
                this.socket.api.lock().then((locked) => {
                    console.log(locked)
                })
            } catch (e) {
                reject(e)
            }
        })
    };
    getExistingRoom = channelId => {
        throw new Error('getExistingRoom is deprecated')
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

    downloadRoomData = (roomId, roomKeys) => {
        return new Promise((resolve, reject) => {
            try {
                console.log(roomKeys)
                this.connect({
                    roomId: roomId,
                    messageCallback: (m) => { console.log(m) },
                    key: roomKeys
                }).then(() => {
                    this.socket.api.downloadData().then((data) => {
                        data.storage.target = window.location.host
                        resolve(data)
                    })
                }).catch(reject)

            } catch (e) {
                console.log(e)
                reject(e)
            }

        })
    };
}

export default ChannelStore;