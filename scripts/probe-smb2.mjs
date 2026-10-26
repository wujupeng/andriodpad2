/** SMB2 协议层探测：直连 192.168.2.3:445 发 NEGOTIATE，观察响应或重置 */
import net from 'node:net';

const HOST = '192.168.2.3';
const PORT = 445;

// SMB2 NEGOTIATE Request（SMB 2.1 方言）
function buildNegotiate() {
  const header = Buffer.alloc(64);
  header.write('\u0000SMB', 0, 'binary');        // ProtocolId: FE 53 4D 42（写成 FE+SMB）
  header[0] = 0xFE;
  header.writeUInt16LE(36 + 4, 16);               // StructureSize(64)+... Command 偏移在 16? 不对：
  return header;
}

// 标准手工构造（正确字段偏移）：
function negotiatePacket() {
  const nbss = Buffer.alloc(4);
  const smb2 = Buffer.alloc(64 + 36 + 4);
  smb2[0] = 0xFE; smb2[1] = 0x53; smb2[2] = 0x4d; smb2[3] = 0x42; // \xfeSMB
  smb2.writeUInt16LE(64, 4);        // StructureSize
  smb2.writeUInt16LE(0, 6);         // CreditCharge
  smb2.writeUInt16LE(1, 8);         // ChannelSequence reserved
  smb2.writeUInt16LE(0, 10);        // ChannelSequence/Reserved
  smb2.writeUInt16LE(0, 12);        // Command = NEGOTIATE
  // 14.. header flags 等（可为 0）
  smb2.writeUInt32LE(0, 28);        // NextCommand
  // MessageId（偏移 32，8 字节）保持置零
  // 40 ProcessId/TreeId/SessionId/Signature 置 0 即可
  // Negotiate 结构（从偏移 64 起）：
  const n = 64;
  smb2.writeUInt16LE(36, n);        // StructureSize
  smb2.writeUInt16LE(4 + 2, n + 2); // SecurityMode: signing enabled
  smb2.writeUInt16LE(0, n + 4);     // DialectCount... 注意 2.1 需 Count=1
  smb2.writeUInt16LE(1, n + 4);     // DialectCount = 1
  smb2.writeUInt16LE(1, n + 6);     // SecurityMode
  smb2.writeUInt32LE(0, n + 8);     // Capabilities
  const guid = Buffer.alloc(16); guid.fill(1);
  guid.copy(smb2, n + 12);
  smb2.writeUInt32LE(0x0202, n + 28); // Dialect 0x0202 = SMB 2.1
  // NBSS 长度
  const len = smb2.length;
  nbss[0] = 0x00;
  nbss.writeUIntBE(len, 1, 3);
  return Buffer.concat([nbss, smb2]);
}

const sock = net.connect({ host: HOST, port: PORT, timeout: 8000 }, () => {
  console.log('TCP_CONNECTED');
  sock.write(negotiatePacket());
});
sock.on('data', (buf) => {
  const magic = buf.slice(4, 8).toString('hex');
  const ascii = buf.slice(4, 8).toString('binary');
  console.log(`SMB_RESPONSE len=${buf.length} magic=${magic} (${ascii})`);
  if (buf.length >= 12) {
    // SMB2 header: status at offset 8（NBSS 4 + 4 ProtocolId 之后）
    const status = buf.readUInt32LE(4 + 8);
    console.log(`NT_STATUS=0x${status.toString(16)}`);
  }
  sock.destroy();
  process.exit(0);
});
sock.on('timeout', () => { console.log('TIMEOUT_NO_RESPONSE'); sock.destroy(); process.exit(2); });
sock.on('error', (e) => { console.log(`SOCKET_ERROR: ${e.message}`); process.exit(3); });