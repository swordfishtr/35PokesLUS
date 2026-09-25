/**
 * Configuration details:
 * enable - whether Controller should run this service.
 * formats - formats to collect usage stats for.
 * rankedOnly - whether to ignore unranked (i.e. challenge) battles.
 * interval - in seconds, how often to check public battles.
 * maxRestartCount - max number of disconnections within maxRestartTimeframe.
 * If this is surpassed, the service won't restart automatically.
 * maxRestartTimeframe - Timeframe in minutes for maxRestartCount.
 * serve - expose API that responds with usage stats (requires express).
 */

import { DatabaseSync, StatementSync } from 'node:sqlite';
import { styleText } from 'node:util';
import { Temporal } from '@js-temporal/polyfill';
import PSBot from './PSBot.js';
import {
	fsLog, importJSON, index, PATH_CONFIG, PATH_LUS, PATH_MISCLOG, PATH_POKEDEX, Predicate, PredicateVar,
	sqlargs, TimeoutRejection, toID,
} from './Utilities.js';

export default new class {

	config = {
		debug: true, // unused
		port: 0 as number | string | null,
		formats: ["gen9nationaldex35pokes"],
		rankedOnly: false,
		interval: 60,
	};

	pokedex: any;
	db = new DatabaseSync(PATH_LUS);
	bot?: PSBot;
	interval: NodeJS.Timeout = null!;

	constructor() {
		const pokedexImport = require(PATH_POKEDEX);
		this.pokedex = pokedexImport.Pokedex || pokedexImport.BattlePokedex;
		if (!this.pokedex) {
			throw new Error('Invalid pokedex.js');
		}
		this.config = { ...this.config, ...importJSON(PATH_CONFIG) };
		if (!(this.config.interval >= 30)) {
			this.config.interval = 30;
			console.log(`!!!! Please don't configure an interval of less than 30 seconds`);
		}
		this.db.exec(this.sql.createTables);
		this.interval = setInterval(this.queryBattles, (this.config.interval) * 1000);
		this.start();
		this.serve();
	}

	async start() {
		if (this.bot) return;
		this.log('Starting!');
		this.bot = new PSBot('Live Usage Stats Bot');
		this.bot.onDisconnect = () => {
			delete this.bot;
			this.log('Disconnected! Reconnecting later.');
			this.waitReconnect().then(this.start);
		};
		try {
			await this.bot.connect();
		}
		catch {
			this.log('Could not start! Retrying later.');
			this.waitReconnect().then(this.start);
		}
	}

	// await this upon disconnection, then try to reconnect.
	// on the first 3 awaits, 1 minute passes.
	// if all fail, it's probably downtime, so 60 minutes pass next.
	// each disconnection is remembered for 5 minutes only.
	disconnectionCount = 0;
	waitReconnect() {
		return new Promise((res, rej) => {
			this.disconnectionCount += 1;
			setTimeout(() => { this.disconnectionCount -= 1; }, 5 * 60 * 1000);
			setTimeout(res, (this.disconnectionCount > 3 ? 1 : 60) * 60 * 1000);
		});
	}

	log = (msg: string) => {
		const time = Temporal.Now.zonedDateTimeISO().toLocaleString();
		let buf = `${time} :: LUS :: ${msg}\n`;
		fsLog(PATH_MISCLOG, buf);
		buf = styleText(['bold'], buf);
		console.log(buf);
	};

	queryBattles = async () => {
		if (!this.bot) return;
		this.log('Query battles ...');
		for (const format of this.config.formats) {

			this.bot.send(`|/cmd roomlist ${format},none,`);
			const roomsData = await this.bot.await('roomlist response', 30, this.RESPONSE);
			const { rooms } = JSON.parse(roomsData.split('|').pop()!);

			for (const room in rooms) {
				if (this.config.rankedOnly && !rooms[room].minElo) continue;
				if (this.sql.checkBattle.get(sqlargs(room))) continue;

				this.log(`New battle: ${room} ...`);

				try {
					this.bot.send(`|/join ${room}`);
					const battleData = await this.bot.await('battle join', 30, this.INITBATTLE(room));
					this.bot.send(`|/noreply /leave ${room}`);

					const mons = battleData
						.split('\n')
						.map((x) => x.split('|', 4))
						.filter((x) => x[1] === 'poke') // If team preview is disabled, the array will be 0 length.
						.map((x) => x[3])
						.map((x) => x.split(', ').shift()!) // Remove gender suffix.
						.map(this.processPokemon)
						.filter((x) => x);

					if (!mons.length) {
						this.log(`Team preview disabled in ${room} - skipping.`);
						continue;
					}

					this.log(`Pokemon brought: ${mons.join(', ')}.`);

					const timestamp = parseInt(/\n\|t:\|(\d+)\n/.exec(battleData)!.pop()!);

					const roomid = this.sql.insertBattle!.run(sqlargs(room, timestamp)).lastInsertRowid;

					for (const mon of mons) {
						this.sql.insertPokemon!.run(sqlargs(mon));
						this.sql.insertUsage!.run(sqlargs(roomid, mon));
					}
				}
				catch (e) {
					if (!(e instanceof TimeoutRejection)) throw e;
					this.log(`Could not join ${room} - skipping.`);
				}
			}

		}
	};

	// We need to:
	// - store cosmetic formes as base formes
	// - treat cosmetic formes in index as base formes
	// - treat teampreview-hidden species in index as base formes
	processPokemon = (mon: string): string => {
		const id = toID(mon);
		const species = this.pokedex[id];
		if (!species) return '';

		const baseSpecies = this.pokedex[toID(species.baseSpecies || species.name)];

		const previewHidden = [
			'greninja', 'gourgeist', 'pumpkaboo', 'xerneas', 'silvally', 'urshifu', 'dudunsparce',
		]
		if (previewHidden.includes(toID(baseSpecies.name))) {
			return toID(baseSpecies.name);
		}

		// this will fail in certain cases like Vivillon
		if (baseSpecies.cosmeticFormes?.includes(species.name)) {
			return toID(baseSpecies.name);
		}

		return toID(species.name);
	};

	RESPONSE: Predicate = (msg) => {
		const data = msg.split('|', 4);
		return data[0] === '' &&
		data[1] === 'queryresponse' &&
		data[2] === 'roomlist' ||
		null;
	};

	INITBATTLE: PredicateVar = (room) => (msg) => {
		const data = msg.split('\n', 2).map((x) => x.split('|', 3));
		return data[0]?.[0].slice(1) === room &&
		data[1]?.[0] === '' &&
		data[1][1] === 'init' &&
		data[1][2] === 'battle' ||
		null;
	};

	sql = (() => {
		// Reference to parent class for use in the getters.
		const lus = this;
		return {

			createTables: `
CREATE TABLE IF NOT EXISTS pokemon (
	id INTEGER PRIMARY KEY,
	species TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS battles (
	id INTEGER PRIMARY KEY,
	room TEXT UNIQUE NOT NULL,
	timestamp INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pokemon_in_battles (
	id INTEGER PRIMARY KEY,
	species_id INTEGER NOT NULL,
	room_id INTEGER NOT NULL,
	FOREIGN KEY (species_id) REFERENCES pokemon (id),
	FOREIGN KEY (room_id) REFERENCES battles (id)
);
`,
			get checkBattle() { return lus.db?.prepare(`
SELECT 1
FROM battles
WHERE room=?1;
`)},
			get insertBattle() { return lus.db?.prepare(`
INSERT INTO battles (room, timestamp)
VALUES (?1, ?2);
`); },
			get insertPokemon() { return lus.db?.prepare(`
INSERT INTO pokemon (species)
SELECT ?1
WHERE NOT EXISTS (
	SELECT 1
	FROM pokemon
	WHERE species=?1
);
`); },
			get insertUsage() { return lus.db?.prepare(`
INSERT INTO pokemon_in_battles (room_id, species_id)
SELECT ?1, id
FROM pokemon
WHERE species=?2;
`); },
			get getFullUsage() { return lus.db?.prepare(`
SELECT b.room, p.species
FROM pokemon p
JOIN pokemon_in_battles pb
ON (p.id=pb.species_id)
JOIN battles b
ON (pb.room_id=b.id);
`); },

		} as const satisfies Record<string, string | StatementSync | undefined>;
	})();

	// call only once
	serve() {
		if (this.config.port === null) {
			console.log(`!!!! Server for live usage stats disabled`);
			return;
		}
		try {
			const express = require('express') as typeof import('express');
			const app = express();

			app.get('/', (req, res) => {
				const raw = this.sql.getFullUsage.all();
				const out: Record<string, string[]> = {};
				for (const { room, species } of raw) {
					out[room as any] ??= [];
					out[room as any].push(species as any);
				}
				res.json(out);
			});

			app.get('/:group/:meta', (req, res) => {
				let { group, meta } = req.params;
				if (!meta.endsWith('.txt')) meta += '.txt';
				const format = index.metagames[group]?.[meta]
					?.filter((x) => !x.header)
					.map((x) => this.processPokemon(x.value))
					.filter((x) => x);
				if (!format) {
					res.status(404).json({ error: 'Format not found.' });
					return;
				}
				const raw = this.sql.getFullUsage.all();
				const out: Record<string, string[]> = {};
				for (const { room, species } of raw) {
					out[room as any] ??= [];
					out[room as any].push(toID(species));
				}
				for (const room in out) {
					if (!out[room].every((mon) => format.includes(mon))) {
						delete out[room];
					}
				}
				res.json(out);
			});

			const port = (typeof this.config.port === 'string'
				? Number(process.env[this.config.port])
				: this.config.port) || 0;
			const listener = app.listen(port, () => {
				const address = listener.address();
				if (typeof address === 'string') {
					console.log(`!!!! Server listening at ${address}`);
				}
				else if (address) {
					console.log(`!!!! Server listening on port ${address.port}`);
				}
				else {
					console.log(`!!!! Server listening`);
				}
			});
		}
		catch (err) {
			console.error(err);
		}
	}

};
