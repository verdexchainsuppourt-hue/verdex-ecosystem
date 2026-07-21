function passwordStrength(p) {
  if (typeof p !== 'string' || p.length < 6) return { score: 0, label: 'Too short', pass: false };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score], pass: p.length >= 6 };
}
console.log('abcdef:', JSON.stringify(passwordStrength('abcdef')));
console.log('abcdefgh:', JSON.stringify(passwordStrength('abcdefgh')));
console.log('Abcdefgh1:', JSON.stringify(passwordStrength('Abcdefgh1')));
console.log('Abcdefgh1!:', JSON.stringify(passwordStrength('Abcdefgh1!')));
