// Quick brace/paren checker for FQCAnalysisPage
const fs = require('fs');
const content = fs.readFileSync('src/components/pages/FQCAnalysisPage.tsx', 'utf8');

let braceStack = [];
let parenStack = [];
let inTemplate = false;
let inString = false;
let stringChar = '';
let inJSXComment = false;
let inLineComment = false;
let inBlockComment = false;
let lastBrace = 0;
let lineNum = 1;
let colNum = 1;

for (let i = 0; i < content.length; i++) {
  const ch = content[i];
  const next = content[i+1] || '';
  
  if (ch === '\n') { lineNum++; colNum = 1; continue; }
  colNum++;
  
  // Skip strings
  if (inString) {
    if (ch === '\\') { i++; continue; } // escaped
    if (ch === stringChar) inString = false;
    continue;
  }
  
  // Skip comments
  if (inJSXComment) {
    if (ch === '*' && next === '/') { inJSXComment = false; i++; }
    continue;
  }
  if (inLineComment) {
    if (ch === '\n') inLineComment = false;
    continue;
  }
  if (inBlockComment) {
    if (ch === '*' && next === '/') { inBlockComment = false; i++; }
    continue;
  }
  
  // Detect string start
  if (ch === "'" || ch === '"' || ch === '`') {
    inString = true; stringChar = ch; continue;
  }
  
  // Detect JSX comment {/* */}
  if (ch === '{' && next === '/' && content[i+2] === '*') {
    inJSXComment = true;
    i += 2; // skip {/*
    // find */}
    const end = content.indexOf('*/}', i);
    if (end >= 0) i = end + 2; // skip to }
    else inJSXComment = true;
    continue;
  }
  
  // Detect line comment
  if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
  
  // Detect block comment
  if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
  
  // Track parens and braces
  if (ch === '{') braceStack.push({line: lineNum, col: colNum});
  if (ch === '}') {
    if (braceStack.length === 0) {
      console.log(`UNEXPECTED } at line ${lineNum}, col ${colNum}`);
    } else {
      const open = braceStack.pop();
      // console.log(`} matches { at line ${open.line}`);
    }
  }
  if (ch === '(') parenStack.push({line: lineNum, col: colNum});
  if (ch === ')') {
    if (parenStack.length === 0) {
      console.log(`UNEXPECTED ) at line ${lineNum}, col ${colNum}`);
    } else {
      parenStack.pop();
    }
  }
}

console.log(`\nFinal: ${braceStack.length} unclosed braces, ${parenStack.length} unclosed parens`);
braceStack.forEach(b => console.log(`  Unclosed { at line ${b.line}, col ${b.col}`));
parenStack.forEach(p => console.log(`  Unclosed ( at line ${p.line}, col ${p.col}`));
