import { randomUUID } from 'crypto';
import * as https from 'http';
import * as peer from 'noise-peer';
import { v4 as getUUID } from 'uuid';

export default class RequestHandler {
	private SecStream: peer.NoisePeer
	private requestTimeout: number;

	constructor(SecStream: peer.NoisePeer, requestTimeout: number) {
		this.SecStream = SecStream;
		this.requestTimeout = requestTimeout;
	}

	request(eventname: string, payload: unknown): Promise<Response[]> {
		return this.requestCustomTimeout(eventname, payload);
	}

	requestCustomTimeout(eventName: string, payload: unknown): Promise<Response[]> {
		return this.doRequest(this.SecStream, eventName, payload);
	}

	private doRequest(SecStream: peer.NoisePeer, path: string, payload: unknown): Promise<Response[]> {
		return new Promise(function (resolve, reject) {
			const data = {
				id: getUUID(),
				modulename: 'kernel',
				eventname: path,
				timeout: this.requestTimeout,
				payload: payload
			}

			//Prepare request with response logic
			SecStream.write(data);
			SecStream.end();
		});
	}
}
