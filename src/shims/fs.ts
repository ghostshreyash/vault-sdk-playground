const unavailable = (method: string) => () => {
  throw new Error(
    `[fs shim] fs.${method} is not available in the browser. ` +
      `Pass a File/Blob or { buffer, name } to the Vault SDK instead of a path on disk.`
  );
};

export const promises = {
  readFile: unavailable("promises.readFile"),
  writeFile: unavailable("promises.writeFile"),
  stat: unavailable("promises.stat"),
};

export const readFile = unavailable("readFile");
export const readFileSync = unavailable("readFileSync");
export const existsSync = () => false;
export const createReadStream = unavailable("createReadStream");

export default {
  promises,
  readFile,
  readFileSync,
  existsSync,
  createReadStream,
};
