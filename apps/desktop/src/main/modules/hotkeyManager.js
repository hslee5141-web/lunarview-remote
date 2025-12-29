/**
 * Hotkey Manager Module
 * 단축키 관리 및 로컬/원격 라우팅
 */

// 기본 단축키 프리셋
const DEFAULT_PRESETS = {
    default: {
        name: '기본',
        mappings: {
            'Ctrl+C': 'remote',
            'Ctrl+V': 'remote',
            'Ctrl+X': 'remote',
            'Ctrl+Z': 'remote',
            'Ctrl+A': 'remote',
            'Ctrl+S': 'remote',
            'Alt+Tab': 'local',
            'Alt+F4': 'local',
            'Win': 'local',
        }
    },
    allRemote: {
        name: '모두 원격',
        mappings: {
            'Ctrl+C': 'remote',
            'Ctrl+V': 'remote',
            'Ctrl+X': 'remote',
            'Ctrl+Z': 'remote',
            'Ctrl+A': 'remote',
            'Ctrl+S': 'remote',
            'Alt+Tab': 'remote',
            'Alt+F4': 'remote',
            'Win': 'remote',
        }
    },
    developer: {
        name: '개발자',
        mappings: {
            'Ctrl+C': 'remote',
            'Ctrl+V': 'remote',
            'Ctrl+X': 'remote',
            'Ctrl+Z': 'remote',
            'Ctrl+Shift+C': 'local',  // 로컬 복사
            'Ctrl+Shift+V': 'local',  // 로컬 붙여넣기
            'Alt+Tab': 'local',
            'F5': 'remote',
            'F12': 'remote',
        }
    }
};

let currentPreset = 'default';
let customMappings = {};
let hotkeyEnabled = true;

/**
 * 단축키 조합 문자열 생성
 */
function getKeyCombo(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Win');

    // 수정자 키 자체가 아닌 경우에만 키 추가
    const key = event.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
    }

    return parts.join('+');
}

/**
 * 단축키가 로컬용인지 확인
 */
function isLocalHotkey(event) {
    if (!hotkeyEnabled) return false;

    const combo = getKeyCombo(event);
    const preset = DEFAULT_PRESETS[currentPreset];

    // 커스텀 매핑 우선
    if (customMappings[combo]) {
        return customMappings[combo] === 'local';
    }

    // 프리셋 매핑
    if (preset && preset.mappings[combo]) {
        return preset.mappings[combo] === 'local';
    }

    // 기본: 원격
    return false;
}

/**
 * 프리셋 변경
 */
function setPreset(presetName) {
    if (DEFAULT_PRESETS[presetName]) {
        currentPreset = presetName;
        console.log(`[Hotkey] Preset changed to: ${presetName}`);
        return true;
    }
    return false;
}

/**
 * 커스텀 매핑 설정
 */
function setCustomMapping(combo, target) {
    if (target === 'local' || target === 'remote') {
        customMappings[combo] = target;
        console.log(`[Hotkey] Custom mapping: ${combo} -> ${target}`);
        return true;
    }
    return false;
}

/**
 * 커스텀 매핑 제거
 */
function removeCustomMapping(combo) {
    delete customMappings[combo];
    return true;
}

/**
 * 모든 매핑 가져오기
 */
function getAllMappings() {
    const preset = DEFAULT_PRESETS[currentPreset];
    return {
        preset: currentPreset,
        presetName: preset?.name || 'Unknown',
        mappings: { ...preset?.mappings, ...customMappings },
        customMappings,
    };
}

/**
 * 사용 가능한 프리셋 목록
 */
function getPresets() {
    return Object.entries(DEFAULT_PRESETS).map(([key, value]) => ({
        id: key,
        name: value.name,
    }));
}

/**
 * 단축키 기능 활성화/비활성화
 */
function setEnabled(enabled) {
    hotkeyEnabled = enabled;
    console.log(`[Hotkey] ${enabled ? 'Enabled' : 'Disabled'}`);
}

function isEnabled() {
    return hotkeyEnabled;
}

/**
 * 설정 저장 (JSON)
 */
function exportSettings() {
    return JSON.stringify({
        preset: currentPreset,
        customMappings,
        enabled: hotkeyEnabled,
    });
}

/**
 * 설정 불러오기
 */
function importSettings(json) {
    try {
        const settings = JSON.parse(json);
        if (settings.preset) currentPreset = settings.preset;
        if (settings.customMappings) customMappings = settings.customMappings;
        if (typeof settings.enabled === 'boolean') hotkeyEnabled = settings.enabled;
        return true;
    } catch (error) {
        console.error('[Hotkey] Import error:', error);
        return false;
    }
}

module.exports = {
    getKeyCombo,
    isLocalHotkey,
    setPreset,
    setCustomMapping,
    removeCustomMapping,
    getAllMappings,
    getPresets,
    setEnabled,
    isEnabled,
    exportSettings,
    importSettings,
    DEFAULT_PRESETS,
};
