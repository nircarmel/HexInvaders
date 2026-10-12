from PIL import Image

def crop_and_pad_favicon(img_path):
    img = Image.open(img_path).convert("RGBA")
    
    # Get bounding box of non-transparent content
    bbox = img.getbbox()
    if not bbox:
        print("No non-transparent content found.")
        return
        
    print(f"Original bounding box: {bbox}")
    
    # Crop to the exact bounding box
    cropped = img.crop(bbox)
    
    # Calculate dimensions
    content_width, content_height = cropped.size
    
    # To make the content take 80% of the total space,
    # the total space = content / 0.8
    # Which means padding = 10% of total space on each side
    total_width = int(content_width / 0.8)
    total_height = int(content_height / 0.8)
    
    # Make the container square if the favicon should be square
    target_size = max(total_width, total_height)
    
    # Create new blank Image
    new_img = Image.new("RGBA", (target_size, target_size), (255, 255, 255, 0))
    
    # Center the cropped content
    paste_x = (target_size - content_width) // 2
    paste_y = (target_size - content_height) // 2
    
    new_img.paste(cropped, (paste_x, paste_y))
    
    # Overwrite the file
    new_img.save("POW_fav.png", "PNG")
    print(f"Done padding and cropping! Final size: {target_size}x{target_size}")

if __name__ == "__main__":
    crop_and_pad_favicon("POW_fav.png")
