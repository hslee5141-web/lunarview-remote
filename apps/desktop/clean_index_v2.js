const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/main/index.js');
let content = fs.readFileSync(filePath, 'utf8');

// The marker for the end of imports
const startMarker = 'const { fixedPassword, trustedDevices, savedConnections } = require(\'./modules/trustedDevices\');';
// The marker for the start of the next section
const endMarker = 'const isDev = false;';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    console.log('Found markers at', startIndex, endIndex);

    // We want to keep the startMarker line, but delete everything after it up to endMarker.
    // However, endMarker is inside "Config" section usually.
    // Let's check view_file again. 
    // Line 25: imports...
    // Line 93: const isDev = false; 
    // And there are comments before isDev: // =================== // 환경 설정 etc.

    // Let's search for the first // =================== after imports.
    const separatorMarker = '// ===================';
    const separatorIndex = content.indexOf(separatorMarker, startIndex);

    if (separatorIndex !== -1 && separatorIndex < endIndex) {
        const part1 = content.substring(0, startIndex + startMarker.length);
        const part2 = content.substring(separatorIndex); // Keep the separator

        const newContent = part1 + '\n\n' + part2;
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Successfully removed duplicated block between imports and config.');
    } else {
        console.log('Separator not found between imports and config.');
    }

} else {
    console.log('Markers not found.', startIndex, endIndex);
}
