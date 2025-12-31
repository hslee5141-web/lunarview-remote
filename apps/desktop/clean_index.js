const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/main/index.js');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '딥링크 프로토콜 설정';
const endMarkerIdentifier = '환경 설정'; // partial match
const endMarkerContext = '// ==================='; // context for end marker

// Find marker
const markerIndex = content.indexOf(startMarker);

if (markerIndex !== -1) {
    // Find absolute start of that line
    const lastNewlineBefore = content.lastIndexOf('\n', markerIndex);
    const startIndex = lastNewlineBefore === -1 ? 0 : lastNewlineBefore + 1;

    // Find end marker
    const endContextIndex = content.indexOf(endMarkerContext, startIndex);

    if (endContextIndex !== -1) {
        console.log('Found block start at', startIndex, 'end at', endContextIndex);

        const part1 = content.substring(0, startIndex);
        const part2 = content.substring(endContextIndex);

        const newContent = part1 + part2;
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Successfully removed duplicate block.');
    } else {
        console.log('End marker not found.');
    }
} else {
    console.log('Start marker "딥링크 프로토콜 설정" not found.');
}
