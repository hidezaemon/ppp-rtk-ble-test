"use strict";

const DEVICE_NAME = "PPP-RTK-BLE-TEST";
const SERVICE_UUID = "0ab160a7-f2fb-4391-880e-16ba8b7df3d8";
const RX_UUID = "fc519ad9-cb65-4951-bcf9-de1eea7942d4";
const TX_UUID = "cc9c2f16-a685-463b-b3a5-586b986bcbbf";

const connectButton = document.querySelector("#connect-button");
const disconnectButton = document.querySelector("#disconnect-button");
const connectionStatus = document.querySelector("#connection-status");
const customCommand = document.querySelector("#custom-command");
const customSendButton = document.querySelector("#send-custom-button");
const receiveLog = document.querySelector("#receive-log");
const errorLog = document.querySelector("#error-log");
const sendControls = Array.from(document.querySelectorAll(".send-control"));

let device = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let notifyReady = false;

function timestamp() {
  return new Date().toLocaleTimeString("ja-JP", { hour12: false });
}

function appendLog(element, message) {
  element.textContent += `[${timestamp()}] ${message}\n`;
  element.scrollTop = element.scrollHeight;
}

function setState(label, connected, canSend) {
  connectionStatus.textContent = label;
  connectButton.disabled = connected;
  disconnectButton.disabled = !connected;
  sendControls.forEach((control) => {
    control.disabled = !canSend;
  });
}

function clearGattReferences() {
  notifyReady = false;
  rxCharacteristic = null;
  txCharacteristic = null;
}

function handleDisconnected() {
  appendLog(receiveLog, "BLE切断");
  clearGattReferences();
  setState("未接続", false, false);
}

function handleNotification(event) {
  const value = event.target.value;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  try {
    const message = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    appendLog(receiveLog, `RX: ${message}`);
  } catch (error) {
    appendLog(errorLog, `通知のUTF-8デコード失敗: ${error.message}`);
  }
}

async function connect() {
  if (!navigator.bluetooth) {
    appendLog(errorLog, "Web Bluetooth APIを利用できません。Android ChromeとHTTPSを確認してください。");
    return;
  }

  setState("デバイス選択中", true, false);
  try {
    // requestDevice must remain inside this user-click handler.
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID],
    });
    device.addEventListener("gattserverdisconnected", handleDisconnected);

    setState("接続・サービス確認中", true, false);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(RX_UUID);
    txCharacteristic = await service.getCharacteristic(TX_UUID);
    txCharacteristic.addEventListener("characteristicvaluechanged", handleNotification);
    await txCharacteristic.startNotifications();

    notifyReady = true;
    setState(`接続済み: ${device.name || DEVICE_NAME}`, true, true);
    appendLog(receiveLog, "接続完了・TX Notify購読完了");
  } catch (error) {
    appendLog(errorLog, `接続失敗: ${error.name}: ${error.message}`);
    if (device && device.gatt && device.gatt.connected) {
      device.gatt.disconnect();
    }
    clearGattReferences();
    setState("未接続", false, false);
  }
}

function disconnect() {
  if (device && device.gatt && device.gatt.connected) {
    device.gatt.disconnect();
  } else {
    handleDisconnected();
  }
}

async function writeCommand(command) {
  if (!notifyReady || !rxCharacteristic || !device || !device.gatt.connected) {
    appendLog(errorLog, "送信不可: BLE接続とNotify購読が完了していません。");
    return;
  }

  try {
    const payload = new TextEncoder().encode(command);
    if (typeof rxCharacteristic.writeValueWithoutResponse === "function") {
      await rxCharacteristic.writeValueWithoutResponse(payload);
    } else {
      await rxCharacteristic.writeValue(payload);
    }
    appendLog(receiveLog, `TX: ${command}`);
  } catch (error) {
    appendLog(errorLog, `送信失敗: ${error.name}: ${error.message}`);
  }
}

connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", disconnect);

document.querySelectorAll("button[data-command]").forEach((button) => {
  button.addEventListener("click", () => writeCommand(button.dataset.command));
});

customSendButton.addEventListener("click", () => writeCommand(customCommand.value));
customCommand.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    writeCommand(customCommand.value);
  }
});

setState("未接続", false, false);
