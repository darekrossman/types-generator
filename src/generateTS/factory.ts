import { DocumentationGenerator } from "./docgen/doc";
import NullDocumentationGenerator from "./docgen/nulldoc";
import * as ContentstackTypes from "../types/schema";
import { TypePrefixingOptions } from "../types";
import * as _ from "lodash";

export type TSGenOptions = {
  docgen: DocumentationGenerator;
  naming?: {
    prefix: string;
    prefixing?: TypePrefixingOptions;
  };
  systemFields?: boolean;
};

export type TSGenResult = {
  definition: string;
  metadata: {
    name: string;
    types: {
      javascript: Set<string>;
      contentstack: Set<string>;
      globalFields: Set<string>;
    };
    dependencies: {
      globalFields: GlobalFieldCache;
      contentTypes: Set<string>;
    };
  };
};

type GlobalFieldCache = {
  [prop: string]: { definition: string };
};

type ModularBlockCache = {
  [prop: string]: string;
};

enum TypeFlags {
  BuiltinJS = 1 << 0,
  BuiltinCS = 1 << 1,
  UserGlobalField = 1 << 2,
  UserBlock = 1 << 3,
  UserGroup = 1 << 4,
  UserReference = 1 << 5,
}

type TypeMapMatch = {
  func: (field: ContentstackTypes.Field) => string;
  track: boolean;
  flag: TypeFlags;
};

type TypeMap = {
  [prop: string]: TypeMapMatch;
};

const defaultOptions: TSGenOptions = {
  docgen: new NullDocumentationGenerator(),
  naming: {
    prefix: "",
    prefixing: { mode: 'none' }
  },
  systemFields: false,
};

export default function (userOptions: TSGenOptions) {
  const options = Object.assign({}, defaultOptions, userOptions);
  const visitedJSTypes = new Set<string>();
  const visitedCSTypes = new Set<string>();
  const visitedGlobalFields = new Set<string>();
  const visitedContentTypes = new Set<string>();
  const cachedGlobalFields: GlobalFieldCache = {};
  const cachedModularBlocks: ModularBlockCache = {};
  const modularBlockInterfaces = new Set<string>();
  const uniqueBlockInterfaces = new Set<string>();
  const usedTypeNames = new Set<string>();
  let counter = 1;

  // Basic type generation functions
  function type_text() {
    return "string";
  }

  function type_number() {
    return "number";
  }

  function type_boolean() {
    return "boolean";
  }

  function type_link() {
    return `${options.naming?.prefix}Link`;
  }

  function type_file(field: ContentstackTypes.Field): string {
    if (field.uid === "parent_uid") {
      return "string | null";
    }
    return `${options.naming?.prefix}File`;
  }

  function type_taxonomy() {
    return `${options?.naming?.prefix}Taxonomy`;
  }

  function type_json_rte(field: ContentstackTypes.Field) {
    let json_rte;
    if (field.config && field.field_metadata?.extension) {
      json_rte = `{ value: { key: string; value: string }[] }`;
    } else {
      json_rte = `{
        type: string;
        uid: string;
        _version: number;
        attrs: Record<string, any>;
        children: JSONRTENode[];
      }`;
    }
    return json_rte;
  }

  // Support functions
  function op_array(type: string, field: ContentstackTypes.Field) {
    let op = "";
    if (field.multiple) {
      op = "[]";
      if (field.max_instance) {
        return ["MaxTuple<", type, ", ", field.max_instance, ">"].join("");
      }
    }
    return type + op;
  }

  function op_required(required: boolean) {
    return required ? "" : "?";
  }

  function op_paren(block: string) {
    return `(${block})`;
  }

  function visit_field_choices(field: ContentstackTypes.Field) {
    const choices = field.enum.choices;
    const length = choices.length;

    if (!choices && !length) return "";

    function get_value(choice: { value: string }) {
      if (field.data_type === "number") {
        return choice.value;
      }
      return `${JSON.stringify(choice.value)}`;
    }

    return op_paren(choices.map((v) => get_value(v)).join(" | "));
  }

  // Helper functions for type name management
  function shouldPrefixType(typeName: string): boolean {
    const prefixing = options.naming?.prefixing;
    if (!prefixing) return false;

    if (prefixing.mode === 'all') {
      return true;
    }
    
    if (prefixing.mode === 'duplicates') {
      const isDuplicate = usedTypeNames.has(typeName);
      if (prefixing.types?.length) {
        return prefixing.types.includes(typeName) || isDuplicate;
      }
      return isDuplicate;
    }

    return false;
  }

  function name_type(uid: string, parentUid?: string) {
    const baseName = _.upperFirst(_.camelCase(uid));
    const shouldPrefix = shouldPrefixType(baseName);
    
    usedTypeNames.add(baseName);
    
    if (shouldPrefix) {
      const prefix = parentUid ? _.upperFirst(_.camelCase(parentUid)) : options?.naming?.prefix;
      return [prefix, baseName].filter((v) => v).join("");
    }

    return baseName;
  }

  // Complex type generation functions
  function type_group(field: ContentstackTypes.Field) {
    return ["{", visit_fields(field.schema), "}"].filter((v) => v).join("\n");
  }

  function type_modular_blocks(field: ContentstackTypes.Field): string {
    let blockInterfaceName = name_type(field.uid);

    const blockInterfaces = field.blocks.map((block) => {
      const fieldType = block.reference_to
        ? name_type(block.reference_to)
        : visit_fields(block.schema || []);

      const schema = block.reference_to
        ? `${fieldType};`
        : `{\n ${fieldType} }`;
      return `${block.uid}: ${schema}`;
    });

    const blockInterfacesKey = blockInterfaces.join(";");

    if (!uniqueBlockInterfaces.has(blockInterfacesKey)) {
      uniqueBlockInterfaces.add(blockInterfacesKey);
      while (cachedModularBlocks[blockInterfaceName]) {
        blockInterfaceName = `${blockInterfaceName}${counter}`;
        counter++;
      }
    }

    const modularInterface = [
      `export interface ${blockInterfaceName} {`,
      blockInterfaces.join("\n"),
      "}",
    ].join("\n");

    modularBlockInterfaces.add(modularInterface);
    return field.multiple ? `${blockInterfaceName}[]` : blockInterfaceName;
  }

  function type_global_field(field: ContentstackTypes.GlobalField) {
    if (!field.schema) {
      throw new Error(`Schema not found for global field '${field.uid}'. Did you forget to include it?`);
    }
    return name_type(field.reference_to);
  }

  function type_reference(field: ContentstackTypes.Field) {
    const references: string[] = [];
    if (Array.isArray(field.reference_to)) {
      field.reference_to.forEach((v) => {
        references.push(name_type(v));
      });
    } else {
      references.push(name_type(field.reference_to));
    }
    return ["(", references.join(" | "), ")", "[]"].join("");
  }

  // Type registration and mapping
  const typeMap: TypeMap = {
    text: { func: type_text, track: true, flag: TypeFlags.BuiltinJS },
    number: { func: type_number, track: true, flag: TypeFlags.BuiltinJS },
    isodate: { func: type_text, track: true, flag: TypeFlags.BuiltinJS },
    boolean: { func: type_boolean, track: true, flag: TypeFlags.BuiltinJS },
    blocks: { func: type_modular_blocks, track: false, flag: TypeFlags.UserBlock },
    global_field: { func: type_global_field, track: true, flag: TypeFlags.UserGlobalField },
    group: { func: type_group, track: false, flag: TypeFlags.UserGroup },
    link: { func: type_link, track: true, flag: TypeFlags.BuiltinCS },
    file: { func: type_file, track: true, flag: TypeFlags.BuiltinCS },
    reference: { func: type_reference, track: true, flag: TypeFlags.UserReference },
    taxonomy: { func: type_taxonomy, track: true, flag: TypeFlags.BuiltinCS },
  };

  // Interface and field processing functions
  function track_dependency(field: ContentstackTypes.Field, type: string, flag: TypeFlags) {
    if (flag === TypeFlags.BuiltinJS) {
      visitedJSTypes.add(type);
    } else if (flag === TypeFlags.UserGlobalField) {
      const _type = name_type(field.reference_to);
      visitedGlobalFields.add(_type);

      if (!cachedGlobalFields[_type]) {
        cachedGlobalFields[_type] = {
          definition: visit_content_type(field),
        };
      }
    } else if (flag === TypeFlags.BuiltinCS) {
      visitedCSTypes.add(type);
    } else if (flag === TypeFlags.UserReference) {
      if (Array.isArray(field.reference_to)) {
        field.reference_to.forEach((v) => {
          visitedContentTypes.add(name_type(v));
        });
      }
    }
  }

  function visit_field_type(field: ContentstackTypes.Field) {
    let type = "any";

    if (field.enum) {
      type = visit_field_choices(field);
    } else {
      const match = typeMap[field.data_type];
      if (match) {
        type = match.func(field);
        if (match.track) {
          track_dependency(field, type, match.flag);
        }
      }
    }

    return op_array(type, field);
  }

  function visit_field(field: ContentstackTypes.Field) {
    let fieldType = "";
    if (field.data_type === "global_field") {
      fieldType = handleGlobalField(field);
    } else if (field.data_type === "blocks") {
      fieldType = type_modular_blocks(field);
    } else if (field.data_type === "json") {
      fieldType = type_json_rte(field);
    } else {
      fieldType = visit_field_type(field);
    }

    const requiredFlag = op_required(field.mandatory);
    const typeModifier =
      ["isodate", "file", "number"].includes(field.data_type) ||
      ["radio", "dropdown"].includes(field.display_type)
        ? field.mandatory
          ? ""
          : " | null"
        : "";

    return `${field.uid}${requiredFlag}: ${fieldType}${typeModifier};`;
  }

  function visit_fields(schema: ContentstackTypes.Schema) {
    return schema
      .map((v) => {
        return [
          options.docgen.field(v.display_name),
          visit_field(v),
        ]
          .filter((v) => v)
          .join("\n");
      })
      .join("\n");
  }

  function visit_content_type(
    contentType: ContentstackTypes.ContentType | ContentstackTypes.GlobalField,
    isFirstPass = false
  ) {
    if (isFirstPass) {
      // First pass - collect type names
      modularBlockInterfaces.clear();
      const typeName = _.upperFirst(_.camelCase(contentType.uid));
      usedTypeNames.add(typeName);
      
      // Process field types in schema
      contentType.schema?.forEach(field => {
        if (field.data_type === 'blocks') {
          field.blocks?.forEach(block => {
            const blockName = _.upperFirst(_.camelCase(block.uid));
            usedTypeNames.add(blockName);
            if (block.schema) {
              // Also collect types from block schemas
              block.schema.forEach(blockField => {
                const fieldTypeName = _.upperFirst(_.camelCase(blockField.uid));
                usedTypeNames.add(fieldTypeName);
              });
            }
          });
        }
      });
      
      return '';
    }

    // Normal pass - generate interfaces
    modularBlockInterfaces.clear();
    const contentTypeInterface = [
      options.docgen.interface(contentType.description),
      define_interface(contentType, options.systemFields),
      "{",
      ["/**", "Version", "*/"].join(" "),
      "_version: number;",
      visit_fields(contentType.schema),
      "}",
    ]
      .filter((v) => v)
      .join("\n");

    return [...modularBlockInterfaces, contentTypeInterface].join("\n\n");
  }

  const handleGlobalField = (field: ContentstackTypes.Field): string => {
    const referenceName = name_type(field.reference_to);
    // Return the reference name with array brackets if the field is multiple
    return `${referenceName}${field.multiple ? "[]" : ""}`;
  };

  function define_interface(
    contentType: ContentstackTypes.ContentType | ContentstackTypes.GlobalField,
    systemFields = false
  ) {
    const interface_declaration = [
      "export interface",
      name_type(
        contentType.data_type === "global_field"
          ? (contentType.reference_to as string)
          : contentType.uid,
        contentType.uid
      ),
    ];
    if (systemFields && contentType.schema_type !== "global_field") {
      interface_declaration.push("extends", name_type("SystemFields"));
    }
    return interface_declaration.join(" ");
  }

  return function (
    contentType: ContentstackTypes.ContentType,
    isFirstPass = false
  ): TSGenResult | any {
    if (contentType.schema_type === "global_field") {
      const name = name_type(contentType.uid);
      if (!cachedGlobalFields[name]) {
        cachedGlobalFields[name] = {
          definition: visit_content_type(contentType, isFirstPass),
        };
      }
      return {
        definition: cachedGlobalFields[name].definition,
        isGlobalField: true,
      };
    }
    return {
      definition: visit_content_type(contentType, isFirstPass),
      metadata: {
        name: name_type(contentType.uid),
        types: {
          javascript: visitedJSTypes,
          contentstack: visitedCSTypes,
          globalFields: visitedGlobalFields,
        },
        dependencies: {
          globalFields: cachedGlobalFields,
          contentTypes: visitedContentTypes,
        },
      },
    };
  };
}
