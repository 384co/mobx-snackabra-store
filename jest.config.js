module.exports = {
	testEnvironment: 'jsdom',
	testMatch: ["**/?(*.)+(spec|test).[t]s"],
	testPathIgnorePatterns: ['/node_modules/', 'dist'], // 
	transform: {
		"^.+\\.ts?$": "ts-jest"
	}
};