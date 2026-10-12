from PIL import Image

# Open the red robot image
img = Image.open('red_robot.png').convert("RGBA")
datas = img.getdata()

# Sample the top-left pixel as the background color to key out
bg_color = datas[0]
print(f"Detected background color: {bg_color}")

# Set a tolerance for background color matching
tolerance = 15

newData = []
for item in datas:
    # If the pixel is close to the background color, make it transparent
    if (abs(item[0] - bg_color[0]) <= tolerance and
        abs(item[1] - bg_color[1]) <= tolerance and
        abs(item[2] - bg_color[2]) <= tolerance):
        newData.append((255, 255, 255, 0))
    else:
        newData.append(item)

img.putdata(newData)
img.save("red_robot.png", "PNG")
print("Finished applying alpha mask to red_robot.png.")
