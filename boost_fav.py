import sys
from PIL import Image

def process_favicon(img_path):
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for r, g, b, a in datas:
        if a == 0:
            new_data.append((r, g, b, a))
            continue
            
        # If it's grayish/black/white, leave it
        # Calculate dominance
        color_max = max(r, g, b)
        color_min = min(r, g, b)
        
        # If the pixel is clearly tinted (saturation > some threshold) 
        # or if it's dark red / dark blue
        # The user said they look 'black' at 16x16, meaning they might be heavily shaded red/blue!
        
        if r > g * 1.1 and r > b * 1.1:
            # It leans Red
            new_data.append((255, int(g*0.3), int(b*0.3), a))
        elif b > r * 1.1 and b > g * 1.1:
            # It leans Blue
            new_data.append((int(r*0.3), int(g*0.3), 255, a))
        else:
            new_data.append((r, g, b, a))
            
    img.putdata(new_data)
    img.save("POW_fav_boosted.png", "PNG")
    print("Done")

if __name__ == "__main__":
    process_favicon("POW_fav.png")
