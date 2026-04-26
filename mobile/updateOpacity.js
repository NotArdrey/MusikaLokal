const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.jsx') && !filePath.endsWith('.js')) {
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // First, if there's an existing activeOpacity, change it to 1
    content = content.replace(/activeOpacity=\{[0-9.]+\}/g, 'activeOpacity={1}');
    content = content.replace(/activeOpacity="[0-9.]+"/g, 'activeOpacity={1}');

    // Next, find all <TouchableOpacity that DO NOT have activeOpacity={1} and add it
    // This is a bit tricky with regex because attributes can be on multiple lines.
    // We can instead parse it, but for a quick script we can do:

    // A naive approach: replace `<TouchableOpacity` with `<TouchableOpacity activeOpacity={1}`
    // But this would duplicate it if it already has activeOpacity={1}.
    // So we first change <TouchableOpacity to a temporary placeholder for those with activeOpacity={1}
    // Wait, better regex:
    // Match <TouchableOpacity followed by any characters until >. If it doesn't contain activeOpacity, add it.

    const regex = /<TouchableOpacity([\s\S]*?)>/g;
    content = content.replace(regex, (match, p1) => {
        if (p1.includes('activeOpacity')) {
            return match;
        } else {
            // Add activeOpacity={1} right after <TouchableOpacity
            return `<TouchableOpacity activeOpacity={1}${p1}>`;
        }
    });

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

walkDir(path.join(__dirname, 'app'), processFile);
walkDir(path.join(__dirname, 'src', 'components'), processFile);
