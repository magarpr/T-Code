/*
Visual Basic .NET Tree-Sitter Query Patterns
Note: Using C# parser as fallback until dedicated VB.NET parser is available
*/
export default `
; Imports statements
(using_directive) @name.definition.imports

; Namespace declarations
(namespace_declaration
  name: (identifier) @name.definition.namespace)
(file_scoped_namespace_declaration
  name: (identifier) @name.definition.namespace)

; Class declarations
(class_declaration
  name: (identifier) @name.definition.class)

; Interface declarations
(interface_declaration
  name: (identifier) @name.definition.interface)

; Structure declarations
(struct_declaration
  name: (identifier) @name.definition.structure)

; Enum declarations
(enum_declaration
  name: (identifier) @name.definition.enum)

; Module declarations (VB.NET specific concept, mapped to class for now)
(class_declaration
  name: (identifier) @name.definition.module)

; Method/Function/Sub declarations
(method_declaration
  name: (identifier) @name.definition.method)

; Property declarations
(property_declaration
  name: (identifier) @name.definition.property)

; Event declarations
(event_declaration
  name: (identifier) @name.definition.event)

; Delegate declarations
(delegate_declaration
  name: (identifier) @name.definition.delegate)

; Attribute declarations
(class_declaration
  (attribute_list
    (attribute
      name: (identifier) @name.definition.attribute)))

; Generic type parameters
(type_parameter_list
  (type_parameter
    name: (identifier) @name.definition.type_parameter))

; LINQ expressions (VB.NET also supports LINQ)
(query_expression) @name.definition.linq_expression
`
