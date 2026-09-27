# collage-ppt-maker
Create .PPTX picture collages which you can then further edit in PowerPoint! Based on my [video-collage-projectfile-maker](https://github.com/zznidar/video-collage-projectfile-maker/).

## Usage
1. Add all your images to slide 1 in PowerPoint. They can be positioned anywhere, overlap etc.
2. Save the file and upload it here
3. Observe the preview
4. You can change the number of rows of your collage/mosaic
5. You can shuffle the images if you want them in a different order
6. You can swap two image tiles by clicking on them
7. Once satisfied, click the `Download` button
8. Open the file in PowerPoint

Everything happens in your browser. Your files are not sent anywhere.

## Code terribility
This is just a quick AI-adaptation of my handwritten project for video collages. Unfortunately, the code is too verbose and way less readable than it could be. The CSS is huge to the point I am not willing to remove unneeded rules by trial-and-error. Instead of using JavaScript for all positioning and styling, I would use CSS's `calc` with `min`/`max` and `vh`/`vw`. But at this point, it would actually be faster to just write it all by hand from scratch. 

Nonetheless, the collage-ppt-maker produces wanted results, as one would expect. Enjoy your new image collages!