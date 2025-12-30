/**
 * Input Controller - Actual Mouse/Keyboard Control
 * robotjs를 사용한 실제 마우스/키보드 제어
 */

let robot: any = null;

// robotjs 로드 시도
try {
    robot = require('@jitsi/robotjs');
    console.log('robotjs loaded successfully');
} catch (error) {
    console.warn('robotjs not available, input control disabled:', error);
}

interface MouseEvent {
    type: 'move' | 'down' | 'up' | 'scroll' | 'click';
    x?: number; // 0-1 normalized
    y?: number; // 0-1 normalized
    button?: number; // 0=left, 1=middle, 2=right
    deltaX?: number;
    deltaY?: number;
}

interface KeyboardEvent {
    type: 'down' | 'up';
    key: string;
    keyCode?: number;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
}

// 화면 크기 캐시
let screenWidth = 1920;
let screenHeight = 1080;

// 화면 크기 초기화
function initScreenSize() {
    if (robot) {
        const size = robot.getScreenSize();
        screenWidth = size.width;
        screenHeight = size.height;
        console.log(`Screen size: ${screenWidth}x${screenHeight}`);
    }
}

// 초기화
initScreenSize();

/**
 * 마우스 이벤트 처리
 */
export function handleMouseEvent(event: MouseEvent): boolean {
    if (!robot) {
        console.log('[Simulation] Mouse:', event);
        return false;
    }

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
                const downButton = getButtonName(event.button || 0);
                robot.mouseToggle('down', downButton);
                break;

            case 'up':
                const upButton = getButtonName(event.button || 0);
                robot.mouseToggle('up', upButton);
                break;

            case 'click':
                const clickButton = getButtonName(event.button || 0);
                robot.mouseClick(clickButton, false);
                break;

            case 'scroll':
                if (event.deltaY !== undefined) {
                    // robotjs는 스크롤 단위가 다름 (음수 = 위로)
                    const scrollAmount = event.deltaY > 0 ? -3 : 3;
                    robot.scrollMouse(0, scrollAmount);
                }
                break;
        }
        return true;
    } catch (error) {
        console.error('Mouse control error:', error);
        return false;
    }
}

/**
 * 키보드 이벤트 처리
 */
export function handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (!robot) {
        console.log('[Simulation] Keyboard:', event);
        return false;
    }

    try {
        const key = mapKeyToRobotjs(event.key, event.keyCode);
        if (!key) {
            console.log('Unmapped key:', event.key);
            return false;
        }

        // 수정자 키 배열 생성
        const modifiers: string[] = [];
        if (event.ctrlKey) modifiers.push('control');
        if (event.altKey) modifiers.push('alt');
        if (event.shiftKey) modifiers.push('shift');
        if (event.metaKey) modifiers.push('command');

        if (event.type === 'down') {
            if (modifiers.length > 0) {
                robot.keyTap(key, modifiers);
            } else {
                robot.keyToggle(key, 'down');
            }
        } else if (event.type === 'up') {
            robot.keyToggle(key, 'up');
        }

        return true;
    } catch (error) {
        console.error('Keyboard control error:', error);
        return false;
    }
}

/**
 * 마우스 버튼 번호를 robotjs 문자열로 변환
 */
function getButtonName(button: number): string {
    switch (button) {
        case 0: return 'left';
        case 1: return 'middle';
        case 2: return 'right';
        default: return 'left';
    }
}

/**
 * JavaScript 키를 robotjs 키로 매핑
 */
function mapKeyToRobotjs(key: string, keyCode?: number): string | null {
    // 특수 키 매핑
    const specialKeys: { [key: string]: string } = {
        'Enter': 'enter',
        'Tab': 'tab',
        'Backspace': 'backspace',
        'Delete': 'delete',
        'Escape': 'escape',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        'Home': 'home',
        'End': 'end',
        'PageUp': 'pageup',
        'PageDown': 'pagedown',
        'Insert': 'insert',
        ' ': 'space',
        'Control': 'control',
        'Alt': 'alt',
        'Shift': 'shift',
        'Meta': 'command',
        'CapsLock': 'capslock',
        'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4',
        'F5': 'f5', 'F6': 'f6', 'F7': 'f7', 'F8': 'f8',
        'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    };

    if (specialKeys[key]) {
        return specialKeys[key];
    }

    // 일반 문자 (소문자로)
    if (key.length === 1) {
        return key.toLowerCase();
    }

    return null;
}

/**
 * 텍스트 입력 (복사-붙여넣기 대안)
 */
export function typeText(text: string): boolean {
    if (!robot) return false;

    try {
        robot.typeString(text);
        return true;
    } catch (error) {
        console.error('Type text error:', error);
        return false;
    }
}

/**
 * 화면 크기 가져오기
 */
export function getScreenSize(): { width: number; height: number } {
    return { width: screenWidth, height: screenHeight };
}

/**
 * robotjs 사용 가능 여부
 */
export function isAvailable(): boolean {
    return robot !== null;
}
