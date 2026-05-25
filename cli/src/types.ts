export type VersionJson = {
  ok: true;
  version: "0.2.0";
  compatible: true;
};

export type ErrorJson = {
  ok: false;
  error: string;
};

export type CliJson = VersionJson | ErrorJson;
