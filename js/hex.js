// js/hex.js
// Handles Hex Grid Mathematics for Flat-Topped Hexagons (Odd-q offset coordinates)

export const hexMath = {
    // Convert Offset (col, row) to Axial (q, r)
    offsetToAxial(col, row) {
        const q = col;
        const r = row - Math.floor((col - (col & 1)) / 2);
        return { q, r };
    },

    // Convert Axial (q, r) back to Offset (col, row)
    axialToOffset(q, r) {
        const col = q;
        const row = r + Math.floor((q - (q & 1)) / 2);
        return { col, row };
    },

    // Distance between two axial coordinates
    axialDistance(q1, r1, q2, r2) {
        return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
    },

    // Distance between two offset coordinates directly
    offsetDistance(col1, row1, col2, row2) {
        const a1 = this.offsetToAxial(col1, row1);
        const a2 = this.offsetToAxial(col2, row2);
        return this.axialDistance(a1.q, a1.r, a2.q, a2.r);
    },

    // Calculate center pixel X and Y for a given hex (col, row)
    hexToPixel(col, row, hexRadius, offsetX = 0, offsetY = 0) {
        const x = col * 1.5 * hexRadius + offsetX;
        const y = row * Math.sqrt(3) * hexRadius + (col % 2 === 1 ? (Math.sqrt(3) / 2) * hexRadius : 0) + offsetY;
        return { x, y };
    },

    // Convert screen/pixel coordinate to axial coordinates loosely, then round to nearest exact hex
    pixelToHex(x, y, hexRadius, offsetX = 0, offsetY = 0) {
        const px = x - offsetX;
        const py = y - offsetY;
        
        // Approximate axial coords for flat topped hexes
        const q = (2/3 * px) / hexRadius;
        const r = (-1/3 * px + Math.sqrt(3)/3 * py) / hexRadius;
        
        return this.hexRound(q, r);
    },
    
    // Convert float axial space to rounded axial integer
    hexRound(q, r) {
        let s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);
        
        const q_diff = Math.abs(rq - q);
        const r_diff = Math.abs(rr - r);
        const s_diff = Math.abs(rs - s);
        
        if (q_diff > r_diff && q_diff > s_diff) {
            rq = -rr - rs;
        } else if (r_diff > s_diff) {
            rr = -rq - rs;
        } else {
            rs = -rq - rr;
        }
        
        return { q: rq, r: rr };
    },
    
    // Pixel to closest board offset coords (col, row)
    pixelToOffset(x, y, hexRadius, offsetX = 0, offsetY = 0) {
        const ax = this.pixelToHex(x, y, hexRadius, offsetX, offsetY);
        return this.axialToOffset(ax.q, ax.r);
    },
    
    // Get adjacent hexes (Axial coords)
    // Flat-topped directions: right, bottom-right, bottom-left, left, top-left, top-right
    hexDirections: [
        {dq: 1, dr: 0},
        {dq: 1, dr: -1},
        {dq: 0, dr: -1},
        {dq: -1, dr: 0},
        {dq: -1, dr: 1},
        {dq: 0, dr: 1}
    ],

    // Return the radius array of offsets covering N steps
    getHexesInRadius(q, r, radius) {
        const results = [];
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                results.push({ q: q + dq, r: r + dr });
            }
        }
        return results;
    }
};
