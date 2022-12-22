import peer from 'noise-peer';
import { v4 as getUUID } from 'uuid';
import { Configdata } from './Utils/interfaces/Configdata';

import { Eventdata } from './Utils/interfaces/Eventdata';
import { Response } from './Utils/interfaces/Response';

export default class RequestHandler {
	private SecStream: peer.NoisePeer
	private config: Configdata;
	private pendingMessages: Map<string, (value: Response | PromiseLike<Response>) => void>;

	constructor(SecStream: peer.NoisePeer, config: Configdata) {
		this.SecStream = SecStream;
		this.config = config;
		this.pendingMessages = new Map<string, (value: Response | PromiseLike<Response>) => void>();

		this.SecStream.on('data', body => {
			const data: Response = JSON.parse(body);
			if (this.pendingMessages.has(data.id)) {
				this.pendingMessages.get(data.id).call(null, data);
				this.pendingMessages.delete(data.id); 
			}
		});
	}

	request(eventname: string, payload: unknown): Promise<Response> {
		return this.requestCustomTimeout(eventname, payload);
	}

	requestCustomTimeout(eventName: string, payload: unknown): Promise<Response> {
		return this.doRequest(this.SecStream, eventName, payload);
	}

	private doRequest(SecStream: peer.NoisePeer, path: string, payload: unknown): Promise<Response> {
		let uuid = getUUID()
		let prm = new Promise<Response>((resolve, reject) => {
			this.pendingMessages.set(uuid, resolve);
			const data: Eventdata = {
				id: uuid,
				modulename: 'kernel',
				pass: this.config.pass,
				eventname: path,
				timeout: this.config.timeout,
				payload: payload
			}

			//Prepare request with response logic
			SecStream.write(JSON.stringify(data));
		});
		return prm;
	}
}
