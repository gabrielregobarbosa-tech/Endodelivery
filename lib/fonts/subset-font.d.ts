declare module "subset-font" {
  export default function subsetFont(font: Buffer, text: string, options: {
    targetFormat: "sfnt";
    variationAxes?: Record<string, number>;
    preserveNameIds?: number[];
    keepFeatures?: string[];
  }): Promise<Buffer>;
}
