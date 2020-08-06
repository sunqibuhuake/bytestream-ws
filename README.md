# bytestream-ws
 websocket 字节流数据粘包

websocket 在通常的业务场景中，收发的数据都是块级的，因此并不需要处理字节流粘包，但是在TCP转WS 时，需要额外像原生应用处理TCP流一样，根据协议处理数据。

### 协议
（待补充