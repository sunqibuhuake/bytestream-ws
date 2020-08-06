/**
 * @description: socket class, 粘包处理
 * @author: Sunqi
 * @TODO: CONVERT TO TYPESCRIPT🚀
 */

import { Buffer } from "buffer/"

export type SocketConfig = {
    port: number,
    host: string
}
export type SocketMessage = {
    action: string,
    payload?: any
}

enum SocketState {
    HEADER = 'header',
    PAYLOAD = 'payload',
    BLOCKED = 'blocked'
}

 

export default class ClientSocket {
    private config: SocketConfig;
    private state: SocketState = SocketState.HEADER;
    private bufferedBytes: number = 0;
    private queue: any[] = [];
    private socket: any;
    private payloadLength: number = 0;

    constructor() {
        this.config = {
            port: 0,
            host: ''
        }
    }

    /**
     * @description: 连接服务器
     * @param config {SocketConfig} 
     * @return: {void}
     */
    public connect(config: SocketConfig) {
        
        this.config = config
        this.socket = new WebSocket(`ws://${this.config.host}:${this.config.port}`)

        this.socket.binaryType = "arraybuffer";
        this.socket.addEventListener('open', () => {
            this.emitMessage({
                action: 'open'
            })
        });

        this.socket.addEventListener('message', async (event: MessageEvent) => {
            let array = new Uint8Array(event.data)
            let buf = Buffer.from(array)
            this.queue.push(buf)
            this.bufferedBytes += buf.length
            this.onData()
        });

        this.socket.addEventListener('error', (error: ErrorEvent) => this.onError(error));
        this.socket.addEventListener('close', () => this.onClose());
    }

    /**
     * @description: 发送数据
     * @param data {Buffer | TypedArray} 
     * @return: {void}
     */
    public send(data: Buffer) {
        if (this.socket && this.socket.readyState == 1) {
            this.socket.send(data.buffer)
        } else {
            console.error(`socket 连接尚未就绪`)
        }
    }

    /**
     * @description: 关闭socket 连接
     * @param {void} 
     * @return: {void}
     */
    public close() {
        if (this.socket) {
            // referrece: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
            let state = this.socket.readyState
            console.log(`Socket 状态: ${state}`)
            if (state <= 1) {
                console.log("关闭 Socket 连接 ...")
                this.socket.close()
            }
        }
    }

    /**
     * @description: socket 数据接收，粘包处理
     * @param {void} 
     * @return: {void}
     */
    private onData() {
        // 进入读取后，再次触发该函数将无法读取
        // todo 加入定时等待机制
        // @modify 读完一次后会触发

        let readable = true
        do {
            switch (this.state) {
                case SocketState.HEADER:
                    readable = this.getHeader();
                    break;
                case SocketState.PAYLOAD:
                    readable = this.getPayload();
                    break;
                case SocketState.BLOCKED:
                    readable = false
            }
        } while (readable)
    }

    /**
     * @description: 解析包头
     * @param {void} 
     * @return: {void}
     */
    private getHeader() {
        const header_size = 10;
        const buffer = this.readBytes(header_size)
        if (!buffer) {
            return false
        }
        this.state = SocketState.BLOCKED
        const header = this.decodeHeader(buffer)
        this.payloadLength = header.pkg_size - header_size
        this.state = SocketState.PAYLOAD;
        return true;
    }

    /**
     * @description: 获取包体数据
     * @param {void} 
     * @return: {boolean}
     */
    private getPayload() {
        let buffer = this.readBytes(this.payloadLength)
        if (!buffer) {
            return false
        }
        this.state = SocketState.BLOCKED
        this.dispatchPackageMessage(buffer)
        this.payloadLength = 0
        this.state = SocketState.HEADER
        return true
    }

    /**
     * @description: 校验是否有足够字节长度的数据可读取
     * @param size {number} 
     * @return: {boolean}
     */
    private hasEnough(size: number) {
        if (this.bufferedBytes >= size) {
            return true
        } else {
            return false
        }
    }

    /**
     * @description: 读取size 长度的字节
     * @param size {number} 
     * @return: {void}
     */
    private readBytes(size: number) {

        if (!this.hasEnough(size)) {
            return false
        }

        let result;
        this.bufferedBytes -= size;

        if (size === this.queue[0].length) {
            return this.queue.shift();
        }

        if (size < this.queue[0].length) {
            result = this.queue[0].slice(0, size);
            this.queue[0] = this.queue[0].slice(size);
            return result;
        }

        result = Buffer.alloc(size);
        let offset = 0;
        let length;

        while (size > 0) {
            length = this.queue[0].length;

            if (size >= length) {
                this.queue[0].copy(result, offset);
                offset += length;
                this.queue.shift();
            } else {
                this.queue[0].copy(result, offset, 0, size);
                this.queue[0] = this.queue[0].slice(size);
            }

            size -= length;
        }
        return result;
    }

    /**
     * @description: 解析包头数据
     * @param buffer {Buffer} 
     * @return: {object}
     */
    private decodeHeader(buffer: Buffer) {
        const proj_flag = buffer.slice(0, 4).toString()
        const trans_layer_ver = readNumber(buffer.slice(4, 6))
        const pkg_size = readNumber(buffer.slice(6))
        return {
            proj_flag, trans_layer_ver, pkg_size
        }
    }

    /**
     * @description: 传递包体数据
     * @param buffer {Buffer} 
     * @return: {void}
     */
    private dispatchPackageMessage(buffer: Buffer) {
        // @modify 整个业务层抛给上层处理
        this.emitMessage({
            action: 'data',
            payload: buffer
        })
    }

    /**
     * @description: post worker message to main process
     * @param message{Message} 
     * @return: {void}
     */
    private emitMessage(message: SocketMessage) {
        // 抛出数据给上层业务逻辑处理
    }

    /**
     * @description: 处理连接错误
     * @param error {SocketError} reference ==> lib.dom.d.ts
     * @return: {void}
     */
    private onError(error: ErrorEvent) {
        this.emitMessage({
            action: 'error',
            payload: { message: '连接异常，请尝试重新连接。' , code: 666}
        })
    }

    /**
     * @description: 处理连接关闭
     * @param {void} 
     * @return: {void}
     */
    private onClose() {
        // logger.debug('连接断开')
        this.emitMessage({
            action: 'close',
            payload: { message: '连接断开，请尝试重新连接。' , code: 666}
        })
    }




}

/**
 * @todo: 整理冗余代码
 * @description: 读取buffer数字
 * @param buffer {Buffer} 
 * @return: {number}
 */

function readNumber(buffer: Buffer) {
    let size = buffer.length
    let num = 0
    switch (size) {
        case 1:
            num = buffer.readUInt8(0)
            break
        case 2:
            num = buffer.readUInt16LE(0)
            break
        case 4:
            num = buffer.readUInt32LE(0)
            break
    }
    return num;
}
