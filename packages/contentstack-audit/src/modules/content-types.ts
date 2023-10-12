import find from 'lodash/find';
import { ux } from '@oclif/core';
import isEmpty from 'lodash/isEmpty';
import { join, resolve } from 'path';
import { existsSync, writeFileSync } from 'fs';

import {
  LogFn,
  ConfigType,
  ModularBlockType,
  ContentTypeStruct,
  GroupFieldDataType,
  RefErrorReturnType,
  CtConstructorParam,
  GlobalFieldDataType,
  JsonRTEFieldDataType,
  ModularBlocksDataType,
  ModuleConstructorParam,
  ReferenceFieldDataType,
  ContentTypeSchemaType,
} from '../types';
import auditConfig from '../config';
import { $t, auditMsg, commonMsg } from '../messages';

/* The `ContentType` class is responsible for scanning content types, looking for references, and
generating a report in JSON and CSV formats. */
export default class ContentType {
  public log: LogFn;
  protected fix: boolean;
  public fileName: string;
  public config: ConfigType;
  public folderPath: string;
  public currentUid!: string;
  public currentTitle!: string;
  public gfSchema: ContentTypeStruct[];
  public ctSchema: ContentTypeStruct[];
  protected schema: ContentTypeStruct[] = [];
  protected missingRefs: Record<string, any> = {};
  public moduleName: keyof typeof auditConfig.moduleConfig;

  constructor({ log, fix, config, moduleName, ctSchema, gfSchema }: ModuleConstructorParam & CtConstructorParam) {
    this.log = log;
    this.config = config;
    this.fix = fix ?? false;
    this.ctSchema = ctSchema;
    this.gfSchema = gfSchema;
    this.moduleName = moduleName ?? 'content-types';
    this.fileName = config.moduleConfig[this.moduleName].fileName;
    this.folderPath = resolve(config.basePath, config.moduleConfig[this.moduleName].dirName);
  }

  /**
   * The `run` function checks if a folder path exists, sets the schema based on the module name,
   * iterates over the schema and looks for references, and returns a list of missing references.
   * @returns the `missingRefs` object.
   */
  async run(returnFixSchema = false) {
    if (!existsSync(this.folderPath)) {
      throw new Error($t(auditMsg.NOT_VALID_PATH, { path: this.folderPath }));
    }

    this.schema = this.moduleName === 'content-types' ? this.ctSchema : this.gfSchema;

    for (const schema of this.schema ?? []) {
      this.currentUid = schema.uid;
      this.currentTitle = schema.title;
      this.missingRefs[this.currentUid] = [];
      const { uid, title } = schema;
      await this.lookForReference([{ uid, name: title }], schema);
      this.log(
        $t(auditMsg.SCAN_CT_SUCCESS_MSG, { title, module: this.config.moduleConfig[this.moduleName].name }),
        'info',
      );
    }

    if (returnFixSchema) {
      return this.schema;
    }

    if (this.fix) {
      await this.writeFixContent();
    }

    for (let propName in this.missingRefs) {
      if (!this.missingRefs[propName].length) {
        delete this.missingRefs[propName];
      }
    }

    return this.missingRefs;
  }

  /**
   * The function checks if it can write the fix content to a file and if so, it writes the content as
   * JSON to the specified file path.
   */
  async writeFixContent() {
    let canWrite = true;

    if (this.fix && !this.config.flags['copy-dir']) {
      canWrite = this.config.flags.yes || (await ux.confirm(commonMsg.FIX_CONFIRMATION));
    }

    if (canWrite) {
      writeFileSync(
        join(this.folderPath, this.config.moduleConfig[this.moduleName].fileName),
        JSON.stringify(this.schema),
      );
    }
  }

  /**
   * The function `lookForReference` iterates through a given schema and performs validation checks
   * based on the data type of each field.
   * @param {Record<string, unknown>[]} tree - An array of objects representing the tree structure of
   * the content type or field being validated. Each object in the array should have a "uid" property
   * representing the unique identifier of the content type or field, and a "name" property
   * representing the display name of the content type or field.
   * @param {ContentTypeStruct | GlobalFieldDataType | ModularBlockType | GroupFieldDataType}  - -
   * `tree`: An array of objects representing the tree structure of the content type or field. Each
   * object in the array should have a `uid` and `name` property.
   */
  async lookForReference(
    tree: Record<string, unknown>[],
    field: ContentTypeStruct | GlobalFieldDataType | ModularBlockType | GroupFieldDataType,
  ): Promise<void> {
    if (this.fix) {
      field.schema = this.runFixOnSchema(tree, field.schema as ContentTypeSchemaType[]);
    }

    for (let child of field.schema ?? []) {
      switch (child.data_type) {
        case 'reference':
          this.missingRefs[this.currentUid].push(
            ...this.validateReferenceField(
              [...tree, { uid: field.uid, name: child.display_name }],
              child as ReferenceFieldDataType,
            ),
          );
          break;
        case 'global_field':
          await this.validateGlobalField(
            [...tree, { uid: child.uid, name: child.display_name }],
            child as GlobalFieldDataType,
          );
          break;
        case 'json':
          if (child.field_metadata.extension) {
            // NOTE Custom field type
          } else if (child.field_metadata.allow_json_rte) {
            // NOTE JSON RTE field type
            this.missingRefs[this.currentUid].push(
              ...this.validateJsonRTEFields(
                [...tree, { uid: child.uid, name: child.display_name }],
                child as ReferenceFieldDataType,
              ),
            );
          }
          break;
        case 'blocks':
          await this.validateModularBlocksField(
            [...tree, { uid: child.uid, name: child.display_name }],
            child as ModularBlocksDataType,
          );
          break;
        case 'group':
          await this.validateGroupField(
            [...tree, { uid: child.uid, name: child.display_name }],
            child as GroupFieldDataType,
          );
          break;
      }
    }
  }

  /**
   * The function validates a reference field in a tree data structure.
   * @param {Record<string, unknown>[]} tree - The "tree" parameter is an array of objects, where each
   * object represents a node in a tree-like structure. Each object can have multiple properties, and
   * the structure of the tree is defined by the relationships between these properties.
   * @param {ReferenceFieldDataType} field - The `field` parameter is of type `ReferenceFieldDataType`.
   * @returns an array of RefErrorReturnType.
   */
  validateReferenceField(tree: Record<string, unknown>[], field: ReferenceFieldDataType): RefErrorReturnType[] {
    return this.validateReferenceToValues(tree, field);
  }

  /**
   * The function "validateGlobalField" asynchronously validates a global field by looking for a
   * reference in a tree data structure.
   * @param {Record<string, unknown>[]} tree - The `tree` parameter is an array of objects. Each object
   * represents a node in a tree structure. The tree structure can be represented as a hierarchical
   * structure where each object can have child nodes.
   * @param {GlobalFieldDataType} field - The `field` parameter is of type `GlobalFieldDataType`. It
   * represents the field that needs to be validated.
   */
  async validateGlobalField(tree: Record<string, unknown>[], field: GlobalFieldDataType): Promise<void> {
    // NOTE Any GlobalField related logic can be added here
    await this.lookForReference(tree, field);
  }

  /**
   * The function validates the reference to values in a JSON RTE field.
   * @param {Record<string, unknown>[]} tree - The "tree" parameter is an array of objects where each
   * object represents a node in a tree-like structure. Each object can have multiple key-value pairs,
   * where the key is a string and the value can be of any type.
   * @param {JsonRTEFieldDataType} field - The `field` parameter is of type `JsonRTEFieldDataType`.
   * @returns The function `validateJsonRTEFields` is returning an array of `RefErrorReturnType`
   * objects.
   */
  validateJsonRTEFields(tree: Record<string, unknown>[], field: JsonRTEFieldDataType): RefErrorReturnType[] {
    // NOTE Other possible reference logic will be added related to JSON RTE (Ex missing assets, extensions etc.,)
    return this.validateReferenceToValues(tree, field);
  }

  /**
   * The function validates the modular blocks field by traversing each module and looking for
   * references.
   * @param {Record<string, unknown>[]} tree - An array of objects representing the tree structure of
   * the modular blocks. Each object in the array represents a node in the tree and contains properties
   * like "uid" and "name".
   * @param {ModularBlocksDataType} field - The `field` parameter is of type `ModularBlocksDataType`.
   * It represents a modular blocks field and contains an array of blocks. Each block has properties
   * like `uid` and `title`.
   */
  async validateModularBlocksField(tree: Record<string, unknown>[], field: ModularBlocksDataType): Promise<void> {
    const { blocks } = field;
    this.fixModularBlocksReferences(tree, blocks);

    for (const block of blocks) {
      const { uid, title } = block;

      await this.lookForReference([...tree, { uid, name: title }], block);
    }
  }

  /**
   * The function `validateGroupField` is an asynchronous function that validates a group field by
   * looking for a reference in a tree data structure.
   * @param {Record<string, unknown>[]} tree - The `tree` parameter is an array of objects that
   * represents a tree structure. Each object in the array represents a node in the tree, and it
   * contains key-value pairs where the keys are field names and the values are the corresponding field
   * values.
   * @param {GroupFieldDataType} field - The `field` parameter is of type `GroupFieldDataType`. It
   * represents the group field that needs to be validated.
   */
  async validateGroupField(tree: Record<string, unknown>[], field: GroupFieldDataType): Promise<void> {
    // NOTE Any Group Field related logic can be added here (Ex data serialization or picking any metadata for report etc.,)
    await this.lookForReference(tree, field);
  }

  /**
   * The function `validateReferenceToValues` checks if all the references specified in a field exist
   * in a given tree of records and returns any missing references.
   * @param {Record<string, unknown>[]} tree - An array of objects representing a tree structure. Each
   * object in the array should have a "name" property.
   * @param {ReferenceFieldDataType | JsonRTEFieldDataType} field - The `field` parameter is an object
   * that represents a reference field in a content type. It has the following properties:
   * @returns The function `validateReferenceToValues` returns an array of `RefErrorReturnType`
   * objects.
   */
  validateReferenceToValues(
    tree: Record<string, unknown>[],
    field: ReferenceFieldDataType | JsonRTEFieldDataType,
  ): RefErrorReturnType[] {
    if (this.fix) return [];

    const missingRefs: string[] = [];
    let { reference_to, display_name, data_type } = field;

    for (const reference of reference_to ?? []) {
      // NOTE Can skip specific references keys (Ex, system defined keys can be skipped)
      if (this.config.skipRefs.includes(reference)) continue;

      const refExist = find(this.ctSchema, { uid: reference });

      if (!refExist) {
        missingRefs.push(reference);
      }
    }

    return missingRefs.length
      ? [
          {
            tree,
            data_type,
            missingRefs,
            display_name,
            ct_uid: this.currentUid,
            name: this.currentTitle,
            treeStr: tree
              .map(({ name }) => name)
              .filter((val) => val)
              .join(' ➜ '),
          },
        ]
      : [];
  }

  /**
   * The function `runFixOnSchema` takes in a tree and a schema, and performs various fixes on the
   * schema based on the data types of the fields.
   * @param {Record<string, unknown>[]} tree - An array of objects representing the tree structure of
   * the schema.
   * @param {ContentTypeSchemaType[]} schema - The `schema` parameter is an array of
   * `ContentTypeSchemaType` objects. Each object represents a field in a content type schema and
   * contains properties such as `data_type`, `field_metadata`, `uid`, `name`, etc.
   * @returns an array of ContentTypeSchemaType objects.
   */
  runFixOnSchema(tree: Record<string, unknown>[], schema: ContentTypeSchemaType[]) {
    // NOTE Global field Fix
    return schema
      .map((field) => {
        const { data_type } = field;
        switch (data_type) {
          case 'global_field':
            return this.fixGlobalFieldReferences(tree, field as GlobalFieldDataType);
          case 'json':
          case 'reference':
            if (data_type === 'json') {
              if (field.field_metadata.extension) {
                // NOTE Custom field type
                return field;
              } else if (field.field_metadata.allow_json_rte) {
                return this.fixMissingReferences(tree, field as JsonRTEFieldDataType);
              }
            }

            return this.fixMissingReferences(tree, field as ReferenceFieldDataType);
          case 'blocks':
            (field as ModularBlocksDataType).blocks = this.fixModularBlocksReferences(
              [...tree, { uid: field.uid, name: field.display_name, data_type: field.data_type }],
              (field as ModularBlocksDataType).blocks,
            );
            if (isEmpty((field as ModularBlocksDataType).blocks)) {
              return null;
            }
            return field;
          case 'group':
            return this.fixGroupField(tree, field as GroupFieldDataType);
          default:
            return field;
        }
      })
      .filter((val: any) => {
        if (val?.schema && isEmpty(val.schema)) return false;

        return !!val;
      }) as ContentTypeSchemaType[];
    // (val.schema ? !isEmpty(val.schema) : true)
  }

  /**
   * The function fixes global field references in a tree structure by adding missing references and
   * returning the field if the reference exists, otherwise returning null.
   * @param {Record<string, unknown>[]} tree - An array of objects representing a tree structure.
   * @param {GlobalFieldDataType} field - The `field` parameter is an object that represents a global
   * field. It has the following properties:
   * @returns either the `field` object if `reference_to` exists in `this.gfSchema`, or `null` if it
   * doesn't.
   */
  fixGlobalFieldReferences(tree: Record<string, unknown>[], field: GlobalFieldDataType) {
    const { reference_to, display_name, data_type } = field;
    if (reference_to && data_type === 'global_field') {
      tree = [...tree, { uid: field.uid, name: field.display_name, data_type: field.data_type }];
      const refExist = find(this.gfSchema, { uid: reference_to });

      if (!refExist) {
        this.missingRefs[this.currentUid].push({
          tree,
          data_type,
          display_name,
          fixStatus: 'Fixed',
          missingRefs: [reference_to],
          ct_uid: this.currentUid,
          name: this.currentTitle,
          treeStr: tree.map(({ name }) => name).join(' ➜ '),
        });
      }

      return refExist ? field : null;
    }

    return field;
  }

  /**
   * The function `fixModularBlocksReferences` takes in an array of tree objects and an array of
   * modular blocks, and returns an array of modular blocks with fixed references.
   * @param {Record<string, unknown>[]} tree - An array of objects representing the tree structure.
   * @param {ModularBlockType[]} blocks - An array of objects representing modular blocks. Each object
   * has properties such as "reference_to", "schema", "title", and "uid".
   * @returns an array of `ModularBlockType` objects.
   */
  fixModularBlocksReferences(tree: Record<string, unknown>[], blocks: ModularBlockType[]) {
    return blocks
      .map((block) => {
        const { reference_to, schema, title: display_name } = block;
        tree = [...tree, { uid: block.uid, name: block.title }];
        const refErrorObj = {
          tree,
          display_name,
          fixStatus: 'Fixed',
          missingRefs: [reference_to],
          ct_uid: this.currentUid,
          name: this.currentTitle,
          treeStr: tree.map(({ name }) => name).join(' ➜ '),
        };

        if (!schema) {
          this.missingRefs[this.currentUid].push(refErrorObj);

          return false;
        }

        // NOTE Global field section
        if (reference_to) {
          const refExist = find(this.gfSchema, { uid: reference_to });

          if (!refExist) {
            this.missingRefs[this.currentUid].push(refErrorObj);
          }

          return refExist;
        }

        block.schema = this.runFixOnSchema(tree, block.schema as ContentTypeSchemaType[]);

        if (isEmpty(block.schema)) {
          this.missingRefs[this.currentUid].push({
            ...refErrorObj,
            missingRefs: 'Empty schema found',
            treeStr: tree.map(({ name }) => name).join(' ➜ '),
          });

          return null;
        }

        return block;
      })
      .filter((val) => val) as ModularBlockType[];
  }

  /**
   * The function `fixMissingReferences` checks for missing references in a given tree and field, and
   * attempts to fix them by removing the missing references from the field's `reference_to` array.
   * @param {Record<string, unknown>[]} tree - An array of objects representing a tree structure. Each
   * object in the array should have a "name" property.
   * @param {ReferenceFieldDataType | JsonRTEFieldDataType} field - The `field` parameter is of type
   * `ReferenceFieldDataType` or `JsonRTEFieldDataType`.
   * @returns the `field` object.
   */
  fixMissingReferences(tree: Record<string, unknown>[], field: ReferenceFieldDataType | JsonRTEFieldDataType) {
    let fixStatus;
    const missingRefs: string[] = [];
    const { reference_to, data_type, display_name } = field;

    for (const reference of reference_to ?? []) {
      // NOTE Can skip specific references keys (Ex, system defined keys can be skipped)
      if (this.config.skipRefs.includes(reference)) continue;

      const refExist = find(this.ctSchema, { uid: reference });

      if (!refExist) {
        missingRefs.push(reference);
      }
    }

    if (!isEmpty(missingRefs)) {
      try {
        field.reference_to = field.reference_to.filter((ref) => !missingRefs.includes(ref));
        fixStatus = 'Fixed';
      } catch (error) {
        fixStatus = `Not Fixed (${JSON.stringify(error)})`;
      }

      this.missingRefs[this.currentUid].push({
        tree,
        data_type,
        fixStatus,
        missingRefs,
        display_name,
        ct_uid: this.currentUid,
        name: this.currentTitle,
        treeStr: tree.map(({ name }) => name).join(' ➜ '),
      });
    }

    return field;
  }

  /**
   * The function `fixGroupField` takes in an array of objects and a field, and performs some
   * operations on the field's schema property.
   * @param {Record<string, unknown>[]} tree - An array of objects representing a tree structure.
   * @param {GroupFieldDataType} field - The `field` parameter is an object that contains the following
   * properties:
   * @returns The function `fixGroupField` returns either `null` or the `field` object.
   */
  fixGroupField(tree: Record<string, unknown>[], field: GroupFieldDataType) {
    const { data_type, display_name } = field;
    field.schema = this.runFixOnSchema(tree, field.schema as ContentTypeSchemaType[]);

    if (isEmpty(field.schema)) {
      this.missingRefs[this.currentUid].push({
        tree,
        data_type,
        display_name,
        fixStatus: 'Fixed',
        ct_uid: this.currentUid,
        name: this.currentTitle,
        missingRefs: 'Empty schema found',
        treeStr: tree.map(({ name }) => name).join(' ➜ '),
      });

      return null;
    }

    return field;
  }
}
