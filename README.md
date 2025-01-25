# Document Scanner

This repository contains the source code for a Document Scanner application, able to run on iOS, Android, and the web via [Ionic](https://ionicframework.com/).

The UI framework used is React, with image operations completed via OpenCV (types provided via @techstark/opencv-js) and the jsPDF library is used to combine the transformed images to a PDF.

TODO:
- Improve contour detection to allow multi-edge elements (which can be cast as 4-vertices polygons)
- Allow manual selection of vertices
- Force manual selection if no automatic contour is available

## How to Run

1) Clone this repository.
0) Install Ionic if needed: `npm install -g @ionic/cli`.
3) Install all packages: `npm install`.
4) Run on the web: `ionic serve`.
5) Run on iOS or Android: See [here](https://ionicframework.com/docs/building/running).
