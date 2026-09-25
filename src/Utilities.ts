import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

export * from './lib/35PokesIndex.js';

export function toID(text: any): string {
	if (typeof text !== 'string') {
		if (text) text = text.id || text.userid || text.roomid || text;
		if (typeof text === 'number') text = `${text}`;
		else if (typeof text !== 'string') return '';
	}
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** relaxed Object.keys */
export function	looseKeys<O extends {}>(o: O) {
		type Keys = keyof O;
		return Object.keys(o) as Keys[];
	}

	/** relaxed Object.entries */
export function	looseEntries<O extends {}>(o: O) {
		type Keys = keyof O;
		type Values = typeof o[Keys];
		return Object.entries(o) as [Keys, Values][];
	}

export function importJSON(m: string) {
	return JSON.parse(fs.readFileSync(m, { encoding: 'utf-8' }));
}

export function fsLog(path: string, data: string) {
	fs.appendFileSync(path, data);
}

/** throws child_process.ExecException | NodeJS.ErrnoException */
export function shell(cmd: string, cwd?: string): Promise<string> {
	return new Promise((res, rej) => {
		child_process.exec(cmd, { cwd }, (error, stdout, stderr) => {
			if(error) rej(error);
			res(stdout);
		});
	});
}

/**
 * In NodeJS SQLite implementation, prepared statements with numbered parameters take
 * arguments from an array. But there is a gotcha: if array index 0 is defined, even
 * as null or undefined, the prepared statement will throw.
 */
export function sqlargs(...args: any[]): any {
	return [, ...args];
}

/**
 * Resolved with the matching message.
 * Rejected with PredicateRejection with the matching message.
 * 
 * true:resolve, null:ignore, false:reject
 */
export type Predicate = (msg: string) => boolean | null;

export type PredicateVar = (...val: string[]) => Predicate;

export enum LogSign {
	IN = '<<',
	OUT = '>>',
	INFO = '::',
	WARN = '!!',
	ERR = 'XX',
}

export enum BotState {
	NEW = 0,
	CONNECTING = 1,
	ONLINE = 2,
	LOGIN = 3,
	USERNAME = 4,
	DISCONNECTED = 5,
}

/** Thrown when a predicate returns false. */
export class PredicateRejection extends Error {

	readonly description?: string;

	constructor(message: string, description?: string) {
		super(message);
		this.description = description;
	}

}

/** Thrown when a predicate times out. */
export class TimeoutRejection extends Error {

	readonly description?: string;

	constructor(description?: string) {
		super();
		this.description = description;
	}

}

/** Thrown when shutdown before a predicate settles. */
export class ShutdownRejection extends Error {

	constructor() {
		super();
	}

}

export const PATH_CRASHLOG = path.join(__dirname, '..', 'crash.log');
export const PATH_MISCLOG = path.join(__dirname, '..', 'misc.log');
export const PATH_CONFIG = path.join(__dirname, '..', 'config.json');
export const PATH_POKEDEX = path.join(__dirname, '..', 'data', 'pokedex.js');
export const PATH_LUS = path.join(__dirname, '..', 'data', 'lus.db');
