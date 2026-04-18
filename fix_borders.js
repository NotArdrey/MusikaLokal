const fs = require('fs');

function fixBorders(filePath, bgString, borderString) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Replace inline styles that set backgroundColor and borderColor but missing borderWidth
    // Pattern: backgroundColor: colors.card, borderColor: colors.border,
    
    const regex = new RegExp(`backgroundColor:\\s*${bgString},\\s*borderColor:\\s*${borderString},(\\s*)(?!borderWidth)(\\w+:)`, 'g');
    content = content.replace(regex, `backgroundColor: ${bgString}, borderColor: ${borderString},$1borderWidth: 1,$1$2`);
    
    const regex2 = new RegExp(`backgroundColor:\\s*${bgString},\\s*borderColor:\\s*${borderString}\\s*\\}\\]`, 'g');
    content = content.replace(regex2, `backgroundColor: ${bgString}, borderColor: ${borderString}, borderWidth: 1 }]`);

    fs.writeFileSync(filePath, content);
}

fixBorders('mobile/app/bookings.tsx', 'colors\\.card', 'colors\\.border');
fixBorders('web/app/bookings.tsx', 'pageCardBackground', 'borderSoft');

console.log('Done');
const fs=require(`"fs`"); let c=fs.readFileSync(`"mobile/app/bookings.tsx`",`"utf-8`"); c=c.replace(/borderColor:\s*colors\.border,\s*(\n\s*)(?!borderWidth)(\w+:)/g, `"borderColor: colors.border,`$1borderWidth: 1,`$1`$2`"); c=c.replace(/borderColor:\s*colors\.border\s*\}\]/g, `"borderColor: colors.border, borderWidth: 1 }]`"); fs.writeFileSync(`"mobile/app/bookings.tsx`",c);
