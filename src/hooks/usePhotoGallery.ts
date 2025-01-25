import { useState, useEffect } from "react";
import { isPlatform } from '@ionic/react';

import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import cv from "@techstark/opencv-js";
import { jsPDF } from "jspdf";
import { Share } from '@capacitor/share';

interface ContourVertices {
  readonly tl: cv.Point;
  readonly tr: cv.Point;
  readonly bl: cv.Point;
  readonly br: cv.Point;
}

export function usePhotoGallery() {
  const [photos, setPhotos] = useState<UserPhoto[]>([]);

  const takePhoto = async () => {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      quality: 100
    });
    let imageBase64 = await readImage(photo);
    const vertices = await automatedContour(imageBase64);

    if (vertices === null) {
      console.log("No contour")
    } else {
      console.log("Found contour")
    }

    // Display the new image by rewriting the 'file://' path to HTTP
    // Details: https://ionicframework.com/docs/building/webview//file-protocol
    const photoRef: UserPhoto = {
      content: imageBase64,
      highlighted: await highlight(imageBase64, vertices),
      vertices: vertices,
    };

    const newPhotos = [photoRef, ...photos];
    setPhotos(newPhotos);
  };

  const readImage = async (photo: Photo): Promise<string> => {
    let base64Data: string;
    if (isPlatform('hybrid')) {
      const file = await Filesystem.readFile({
        path: photo.path!
      });
      if (file.data instanceof Blob) {
        base64Data = await file.data.text();
      } else {
        base64Data = file.data;
      }
    } else {
      base64Data = await base64FromPath(photo.webPath!);
    }

    return base64Data;
  }

  const imageBase64ToMat = async (base64Data: string): Promise<cv.Mat> => {
    let image = new Image()
    image.src = base64Data
    await new Promise(r => {
      image.onload = r
    })

    return cv.imread(image);
  }

  const matToImageBase64 = (imageContentFinal: cv.Mat): string => {
    let tempCanvas = document.createElement("canvas");
    cv.imshow(tempCanvas, imageContentFinal)
    return tempCanvas.toDataURL()
  }

  const automatedContour = async (base64Data: string): Promise<ContourVertices | null> => {
    let imageContent = await imageBase64ToMat(base64Data);

    let gray = new cv.Mat();
    let edged = new cv.Mat();
    let grayNoiseless = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    cv.cvtColor(imageContent, gray, cv.COLOR_BGR2GRAY);
    cv.GaussianBlur(gray, grayNoiseless, new cv.Size(11, 11), 0);
    cv.Canny(grayNoiseless, edged, 75, 200);

    // TODO: improve detection without noise canceling as backup
    // TODO: background contrast?
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let mapContours = new Map<number, number>();
    let approx = new cv.Mat();
    for (var i of [...Array(contours.size()).keys()]) {
      const c = contours.get(i);
      // Approximating the contour
      // Calculates a contour perimeter or a curve length
      const peri = cv.arcLength(c, true)
      cv.approxPolyDP(c, approx, 0.01 * peri, true)
      // if our approximated contour has four points, then we
      // can assume that we have found our screen
      if (approx.size().height == 4) {
        mapContours.set(cv.contourArea(approx), i);
      }
    }

    console.log(mapContours);
    const maxContour = Math.max(...mapContours.keys())
    const maxIndex = mapContours.get(maxContour);
    if (maxIndex === undefined) {
      return null;
    }

    const cont = contours.get(maxIndex);

    let verts = new cv.Mat();
    const peri = cv.arcLength(cont, true)
    cv.approxPolyDP(cont, verts, 0.01 * peri, true)

    // Find the corners
    let tl = new cv.Point(verts.data32S[0], verts.data32S[1]);
    let bl = new cv.Point(verts.data32S[2], verts.data32S[3]);
    let br = new cv.Point(verts.data32S[4], verts.data32S[5]);
    let tr = new cv.Point(verts.data32S[6], verts.data32S[7]);

    return {
      tl,
      bl,
      br,
      tr
    }
  }

  const highlight = async (base64Data: string, vertices: ContourVertices | null): Promise<string> => {
    if (vertices === null) {
      return base64Data;
    }

    let imageContent = await imageBase64ToMat(base64Data);

    cv.line(imageContent, vertices.tl, vertices.tr, [0, 0, 255, 255], 10)
    cv.line(imageContent, vertices.tr, vertices.br, [0, 0, 255, 255], 10)
    cv.line(imageContent, vertices.br, vertices.bl, [0, 0, 255, 255], 10)
    cv.line(imageContent, vertices.bl, vertices.tl, [0, 0, 255, 255], 10)

    return matToImageBase64(imageContent);
  }

  const transform = async (base64Data: string, vertices: ContourVertices | null): Promise<string> => {
    console.log("Check transofmr")
    if (vertices === null) {
      return base64Data;
    }
    console.log("Rea transofmr")
    let imageContent = await imageBase64ToMat(base64Data);
    let imageContentFinal = await imageBase64ToMat(base64Data);

    let tl = vertices.tl;
    let bl = vertices.bl;
    let br = vertices.br;
    let tr = vertices.tr;

    let widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
    let widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    let theWidth = (widthBottom > widthTop) ? widthBottom : widthTop;
    let heightRight = Math.hypot(tr.x - br.x, tr.y - br.y);
    let heightLeft = Math.hypot(tl.x - bl.x, tr.y - bl.y);
    let theHeight = (heightRight > heightLeft) ? heightRight : heightLeft;
    console.log("OP")

    // Transform!
    let finalDestCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, theWidth - 1, 0, theWidth - 1, theHeight - 1, 0, theHeight - 1]);
    let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    let dsize = new cv.Size(theWidth, theHeight);

    let M = cv.getPerspectiveTransform(srcCoords, finalDestCoords)
    cv.warpPerspective(imageContent, imageContentFinal, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    console.log("Rea Done")

    return matToImageBase64(imageContentFinal);
  }

  const generateRawPDF = async ():Promise<jsPDF | null> => {
    if (photos.length === 0) {
      return null;
    }

    var doc = new jsPDF();
    for (const [i, p] of photos.entries()) {
      const base64Image = await transform(p.content, p.vertices);

      doc.addImage(
        base64Image,
        'JPEG',
        0, 0,
        doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()
      );
      if (i !== photos.length - 1) {
        doc.addPage()
      }
    }
    
    return doc;
  }

  const generatePDF = async (raw?:boolean):Promise<string | null> => {
    const doc = await generateRawPDF();
    if (doc === null) {
      return null;
    }

    return doc.output('dataurlstring');
  }

  const share = async () => {
    const content = await generatePDF();
    if (content === null) {
      return;
    }

    await Share.share({
      title: 'See cool stuff',
      text: 'Really awesome thing you need to see right meow',
      url: content,
      dialogTitle: 'Share with buddies',
    });
  }
  const download = async () => {
    function getbase64toBlob(base64Data: any) {
      let contentType = 'image/png';
      let sliceSize = 512;
      base64Data = base64Data.replace(/data\:image\/(jpeg|jpg|png)\;base64\,/gi, '');

      let byteCharacters = atob(base64Data);
      let byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        let slice = byteCharacters.slice(offset, offset + sliceSize);

        let byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        let byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      let blob = new Blob(byteArrays, { type: contentType });
      return blob;
    }

    const content = await generatePDF();
    if (content === null) {
      return;
    }

    if (isPlatform('hybrid')) {
      const blob = getbase64toBlob(content);

      const downloadFile = (blob:Blob, fileName:string) => {
        const link = document.createElement('a');
        // create a blobURI pointing to our Blob
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.target = '_blank';
        // some browser needs the anchor to be in the doc
        document.body.append(link);
        link.click();
        link.remove();
        // in case the Blob uses a lot of memory
        setTimeout(() => URL.revokeObjectURL(link.href), 7000);
      };

      downloadFile(blob, "test.pdf")
    } else {
      await Filesystem.writeFile({
        path: 'pdf.pdf',
        data: content,
        directory: Directory.Documents,
      });
    }
  }

  const deletePhoto = async (photo: UserPhoto) => {
    /*
    // Remove this photo from the Photos reference data array
    const newPhotos = photos.filter(p => p.filepath !== photo.filepath);

    // Update photos array cache by overwriting the existing photo array
    Preferences.set({ key: PHOTO_STORAGE, value: JSON.stringify(newPhotos) });

    // delete photo file from filesystem
    const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);
    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data
    });
    */
    setPhotos([]);
  };

  return {
    deletePhoto,
    photos,
    takePhoto,
    download,
    share
  };
}

export interface UserPhoto {
  content: string;
  highlighted: string;
  vertices: ContourVertices | null;
}

export async function base64FromPath(path: string): Promise<string> {
  const response = await fetch(path);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject('method did not return a string')
      }
    };
    reader.readAsDataURL(blob);
  });
}
