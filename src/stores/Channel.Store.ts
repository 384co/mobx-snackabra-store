import { makeAutoObservable, onBecomeUnobserved, toJS } from "mobx";
import IndexedKV from "../IndexedKV";
import { Channel, ChannelSocket, SBCrypto, SBServer, Snackabra } from "snackabra"
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
    username?: string;
    id?: string;
    messageCallback?: (message: any) => void;
    sbConfig?: SBServer;
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
    id: string | undefined;
    readyResolver: Function | undefined
    ready = new Promise((resolve: Function) => {
        this.readyResolver = resolve
    })
    cacheDb: IndexedKV;
    channel: Snackabra["channel"] | undefined;
    storage: Snackabra["storage"] | undefined;
    rooms = {};
    locked = false;
    isVerifiedGuest = false;
    roomMetadata = {};
    userName = 'Me';
    roomCapacity = 20;
    keys = {};
    userKey = {};
    sharedKeyProp = false;
    //might be more of a local state thing
    loadingMore = false;
    lockEncryptionKey = false;
    lastMessageTimeStamp = 0;
    ownerKey: string | undefined;
    moreMessages = false;
    channelList = {};
    joinRequests = {};
    metadata: ChannelMetadata;
    options: ChannelOptions = {
        username: 'Me',
        sbConfig: {
            channel_server: 'https://channel.384co.workers.dev',
            channel_ws: 'wss://channel.384co.workers.dev',
            storage_server: 'https://storage.384co.workers.dev'
        }
    };
    SB: Snackabra;
    Crypto: SBCrypto;
    constructor(cacheDb: IndexedKV, options: ChannelOptions) {
        this.options = options ? Object.assign(toJS(this.options), options) : toJS(this.options);
        this.cacheDb = cacheDb;
        this.SB = new Snackabra(this.config);
        this.Crypto = new SBCrypto();
        this.storage = this.SB.storage;
        if (!options.sbConfig) {
            console.info('Using default servers in Snackabra.store', this.options.sbConfig);
        }
        makeAutoObservable(this)
        onBecomeUnobserved(this, "rooms", this.suspend);
    }

    suspend = () => {
        // This will be used later to offload the state of the room to a local store
        this.save();
    };

    private loadFromCache = (channelId: string): Promise<Channel | false> => {
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

    connect = (): Promise<this> => {
        return new Promise(async (resolve, reject) => {
            try {
                this.SB.connect(
                    (m) => {
                        this.receiveMessage(m, this.options.messageCallback);
                    },
                    this.options.key,
                    this.options.id
                ).then(c => c.ready).then(async (c) => {
                    if (c) {
                        this.socket = c;
                        if (this.socket.channelId) {
                            this.loadFromCache(this.socket.channelId).then((channel) => {
                                if (channel) {
                                    const roomData = channel && !overwrite ? channel : {
                                        name: overwrite && name ? name : 'Room ' + Math.floor(Object.keys(this.channels).length + 1),
                                        id: channelId,
                                        key: typeof key !== 'undefined' ? key : c.exportable_privateKey,
                                        userName: username !== '' && typeof username !== 'undefined' ? username : '',
                                        lastSeenMessage: 0,
                                        sharedKey: this.socket.owner ? false : await this.Crypto.deriveKey(this.socket.keys.privateKey, this.socket.keys.ownerKey, "AES", false, ["encrypt", "decrypt"]),
                                        contacts: contacts ? contacts : {},
                                        messages: []
                                    };
                                }
                            })
                        } else {
                            reject('Failed to connect to channel')
                        }
                        const roomData = channel && !overwrite ? channel : {
                            name: overwrite && name ? name : 'Room ' + Math.floor(Object.keys(this.channels).length + 1),
                            id: channelId,
                            key: typeof key !== 'undefined' ? key : c.exportable_privateKey,
                            userName: username !== '' && typeof username !== 'undefined' ? username : '',
                            lastSeenMessage: 0,
                            sharedKey: this.socket.owner ? false : await this.Crypto.deriveKey(this.socket.keys.privateKey, this.socket.keys.ownerKey, "AES", false, ["encrypt", "decrypt"]),
                            contacts: contacts ? contacts : {},
                            messages: []
                        };
                        console.warn(roomData)
                        this.setRoom(channelId, roomData).then(async () => {
                            this.key = typeof key !== 'undefined' ? key : c.exportable_privateKey;
                            this.socket.userName = roomData.userName;
                            this.sharedKey = this.socket.owner ? false : await this.Crypto.deriveKey(this.socket.keys.privateKey, this.socket.keys.ownerKey, "AES", false, ["encrypt", "decrypt"])
                            this.save();
                        })
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

    save = (): void => {
        if (this?.id) {
            cacheDb.setItem('sb_data_' + this.activeroom, toJS(this.rooms[this.activeroom])).then(() => {
                const channels = this.channels
                channels[this.activeroom] = { _id: this.rooms[this.activeroom].id, name: this.rooms[this.activeroom].name }
                this.channels = channels;
                cacheDb.setItem('sb_data_channels', this.channels)
            })
        }
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
        if (this.activeRoom) {
            this.rooms[this.activeRoom].lastSeenMessageId = messageId;
        } else {
            throw new Error("no active room")
        }

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
    set storage(storage: Snackabra["storage"] | undefined) {
        this.storage = storage;
    }
    get storage(): Snackabra["storage"] | undefined {
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
        this.channels[this.activeRoom].name = name
        this.save();
    }

    updateChannelName = ({ name, channelId }) => {
        return new Promise((resolve, reject) => {
            try {
                this.getChannel(channelId).then((data) => {
                    this.rooms[channelId] = data
                    this.rooms[channelId].name = name
                    this.channels[channelId].name = name
                    this.save();
                    resolve('success')
                })
            } catch (e) {
                reject(e)
            }

        })
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

    SBMessage = (message: string) => {
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

    //TODO: This isnt in the the jslib atm
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