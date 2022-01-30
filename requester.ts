import * as https from 'http';

export default class RequestHandler {
	private host: string;
	private port: number;

	constructor(host: string, port: number) {
		this.host = host;
		this.port = port;
	}

	request(eventname: string, payload: unknown): Promise<Response[]> {
		return this.requestCustomTimeout(eventname, payload);
	}

	requestCustomTimeout(eventName: string, payload: unknown): Promise<Response[]> {
		return this.doRequest(this.host, this.port, eventName, "POST", {}, payload);
	}

	private doRequest(hostname: string, port: number, path: string, method: string, headers: https.OutgoingHttpHeaders, body: unknown): Promise<Response[]> {
		return new Promise(function (resolve, reject) {
			const data = JSON.stringify(body)
			headers['Content-Type'] = 'application/json';
			headers['Content-Length'] = data.length;
			const options: https.RequestOptions = {
				hostname: hostname,
				port: port,
				path: "/" + path,
				method: method,
				headers: headers
			}

			//Prepare request with response logic
			const req = https.request(options, res => {
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
