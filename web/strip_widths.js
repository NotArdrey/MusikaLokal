const fs = require('fs');

const files = [
  'app/bookings.tsx',
  'app/profile.tsx',
  'app/my_venue.tsx',
  'app/my_studio.tsx',
  'app/my_group.tsx'
];

let changedAny = false;

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const original = content;

    // Pattern 1: { maxWidth: 1024, alignSelf: 'center', width: '100%' }
    // Pattern 2: { maxWidth: 1024, alignSelf: 'center' as const, width: '100%' as any }
    // Catch them generally and replace with { width: '100%' }
    content = content.replace(/maxWidth:\s*1024\s*,\s*alignSelf:\s*'center'(?:\s*as\s+any|\s*as\s+const)?\s*,\s*width:\s*'100%'(?:\s*as\s+any|\s*as\s+const)?/g, "width: '100%'");
    
    // Pattern 3: general stray maxWidth: 1024,
    content = content.replace(/maxWidth:\s*1024\s*,?/g, '');
    
    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log('Updated ' + file);
      changedAny = true;
    }
  } else {
    console.log('File not found: ' + file);
  }
}

if (!changedAny) {
  console.log('No files modified.');
}
