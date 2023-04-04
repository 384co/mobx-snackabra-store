import { describe, expect, test } from '@jest/globals';
import IndexedKV from '../src/IndexedKV'
require("fake-indexeddb/auto");

const options = {
    db: 'test',
    table: 'test_table',
}

interface user { id: number, name: string }

let users: Array<user> = [
    { id: 1, name: 'Bob' },
    { id: 2, name: 'Alice' }
]

describe('IndexedKV Database', () => {
    let db: IndexedKV;
    beforeAll(() => {
        db = new IndexedKV(options);
    })

    test('open DB', () => {
        expect(db instanceof IndexedKV).toBe(true);
    });

    test('DB is ready', async () => {
        expect(await db.IndexedKVReadyFlag).toBe(true);
    });

    test('DB insert Alice', async () => {
        let result = await db.setItem(users[1].id, users[1])
        expect(result).toBe(users[1].id);
    });

    test('DB add Alice (again)', async () => {
        let result = await db.add(users[1].id, users[1])
        expect(typeof result).toBe('object');
        expect(result.id).toBe(users[1].id);
    });

    test('DB insert/replace Alice (again again)', async () => {
        let result = await db.setItem(users[1].id, users[1])
        expect(result).toBe(users[1].id);
    });

    test('DB add Bob', async () => {
        let result = await db.add(users[0].id, users[0])
        expect(result).toBe(users[0].id);
    });

    test('DB get Bob', async () => {
        let result = await db.getItem(users[0].id)
        expect(result.id).toBe(users[0].id);
    });

    test('DB get all entries', async () => {
        let result = await db.getAll()
        expect(result![0].key).toBe(users[0].id);
        expect(result![1].key).toBe(users[1].id);
    });

    test('Goodbye Bob!', async () => {
        let result = await db.removeItem(users[0].id)
        expect(result).toBe(true);
    });

    test('Check to make sure Alice is still with us', async () => {
        let result = await db.getAll()
        let hasAlice = false;
        let hasBob = false;
        result!.forEach(user => {
            if (user.value.name === 'Alice') {
                hasAlice = true;
            }
            if (user.value.name === 'Bob') {
                hasBob = true;
            }
        });
        expect(hasBob).toBe(false);
        expect(hasAlice).toBe(true);
    });

    test(`DB get Bob (but he doesn't exist!)`, async () => {
        let result = await db.getItem(users[0].id)
        expect(result?.id).toBe(undefined);
    });
});