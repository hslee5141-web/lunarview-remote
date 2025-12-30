/**
 * Input Controller Module
 * 원격 입력 처리 (마우스/키보드)
 */

let robot = null;
let screenWidth = 1920;
let screenHeight = 1080;

// robotjs 로드
try {
    robot = require('@jitsi/robotjs');
    const size = robot.getScreenSize();
    screenWidth = size.width;
    screenHeight = size.height;
    console.log(`[InputController] robotjs loaded, screen: ${screenWidth}x${screenHeight}`);
} catch (error) {
    console.warn('[InputController] robotjs not available:', error.message);
}

/**
 * 마우스 이벤트 처리
 */
function handleMouseEvent(event) {
    if (!robot) return false;

    try {
        switch (event.type) {
            case 'move':
                if (event.x !== undefined && event.y !== undefined) {
                    const absX = Math.round(event.x * screenWidth);
                    const absY = Math.round(event.y * screenHeight);
                    robot.moveMouse(absX, absY);
                }
                break;
            case 'down':
                robot.mouseToggle('down', getButtonName(event.button || 0));
                break;
            case 'up':
                robot.mouseToggle('up', getButtonName(event.button || 0));
                break;
            case 'scroll':
                if (event.deltaY !== undefined) {
                    robot.scrollMouse(0, event.deltaY > 0 ? -3 : 3);
                }
                break;
        }
        return true;
    } catch (error) {
        console.error('[InputController] Mouse error:', error);
        return false;
    }
}

/**
 * 키보드 이벤트 처리
 */
function handleKeyboardEvent(event) {
    if (!robot) return false;

    try {
        const key = mapKeyToRobotjs(event.key);
        if (!key) return false;

        const modifiers = [];
        if (event.ctrlKey) modifiers.push('control');
        if (event.altKey) modifiers.push('alt');
        if (event.shiftKey) modifiers.push('shift');

        if (event.type === 'down') {
            modifiers.length > 0 ? robot.keyTap(key, modifiers) : robot.keyToggle(key, 'down');
        } else if (event.type === 'up') {
            robot.keyToggle(key, 'up');
        }
        return true;
    } catch (error) {
        console.error('[InputController] Keyboard error:', error);
        return false;
    }
}

function getButtonName(button) {
    const buttons = { 0: 'left', 1: 'middle', 2: 'right' };
    return buttons[button] || 'left';
}

function mapKeyToRobotjs(key) {
    const specialKeys = {
        'Enter': 'enter', 'Tab': 'tab', 'Backspace': 'backspace',
        'Delete': 'delete', 'Escape': 'escape', ' ': 'space',
        'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
        'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
        'Control': 'control', 'Alt': 'alt', 'Shift': 'shift',
        'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5', 'F6': 'f6',
        'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    };
    if (specialKeys[key]) return specialKeys[key];
    if (key.length === 1) return key.toLowerCase();
    return null;
}

function isAvailable() {
    return robot !== null;
}

function getScreenSize() {
    return { width: screenWidth, height: screenHeight };
}

module.exports = {
    handleMouseEvent,
    handleKeyboardEvent,
    isAvailable,
    getScreenSize,
};
