import { describe, expect, test } from '@jest/globals';
import IndexedKV from '../src/IndexedKV'

const options = {
    db: 'test',
    table: 'test_table',
}

describe('IndexedKV Database', () => {

    // beforeAll(async () => {
    //     await page.goto('https://w3resource.com');
    // });

    test('should be titled "w3resource"', async () => {
        await page.goto('https://w3resource.com');
        const title = await page.title()
        console.log("'" + title + "'")
        expect(title).toMatch(/w3resource/);
    });

    it('open DB', () => {
        const db = new IndexedKV(options);
        expect(typeof db).toBe("object");
    });
});