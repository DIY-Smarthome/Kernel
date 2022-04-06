import * as https from 'http';
import * as peer from 'noise-peer';

export default class RequestHandler {
	private SecStream: peer.NoisePeer

	constructor(SecStream: peer.NoisePeer) {
		this.SecStream = SecStream;
	}

	request(eventname: string, payload: unknown): Promise<Response[]> {
		return this.requestCustomTimeout(eventname, payload);
	}

	requestCustomTimeout(eventName: string, payload: unknown): Promise<Response[]> {
		return this.doRequest(this.SecStream, eventName, payload);
	}

	private doRequest(SecStream: peer.NoisePeer, path: string, payload: unknown): Promise<Response[]> {
		return new Promise(function (resolve, reject) {
			const data = JSON.stringify(payload)

			//Prepare request with response logic
			const req = this.secStream.write(data);
				let body = '';
				res.on('data', chunk => { //receive data chunks
					body += chunk.toString();
				});
				res.on('end', () => {
					resolve(JSON.parse(body));//return data to kernel logic for response to requesting module
					body = "";
				})
			})

			req.on('error', error => {
				console.error(error)
				reject(error);
			})

			if (method !== "GET") {
				req.write(data) //write data to processing module
			}
			req.end(); //end the request
		});
	}
}
